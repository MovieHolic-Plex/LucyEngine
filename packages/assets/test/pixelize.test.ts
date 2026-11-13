import { describe, expect, it } from "vitest";
import { buildPalette, indexPalette, hexToRgb } from "@age/model";
import {
  createImg, removeBackground, downscaleToPalette, makeSprite, makeTileable, limitColors, removeOrphans, inkOutline, splitColumns, countColors, createIndexed,
  buildCharacterSheet, walkFrames, placeInFrame, opaqueBounds, decode, encodePng, indexedToImg, type Img,
} from "../src";

const palette = indexPalette(buildPalette());

function fill(img: Img, x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * img.w + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    }
}

/** 마젠타 배경 위에 색 상자를 그린 합성 그림. */
function onMagenta(w: number, h: number, boxes: Array<[number, number, number, number, [number, number, number]]>): Img {
  const img = createImg(w, h);
  fill(img, 0, 0, w, h, [255, 0, 255]);
  for (const [x, y, bw, bh, rgb] of boxes) fill(img, x, y, bw, bh, rgb);
  return img;
}

describe("배경 제거", () => {
  it("마젠타 배경을 투명하게 하고 대상은 남긴다", () => {
    const cut = removeBackground(onMagenta(200, 200, [[60, 40, 80, 120, [150, 90, 40]]]));
    expect(opaqueBounds(cut)).toEqual({ x: 60, y: 40, w: 80, h: 120 });
  });

  it("대상 안에 갇힌 배경색도 지운다", () => {
    const img = onMagenta(200, 200, [[40, 40, 120, 120, [60, 110, 70]]]);
    fill(img, 90, 90, 20, 20, [255, 0, 255]);
    const cut = removeBackground(img);
    expect(cut.data[(100 * 200 + 100) * 4 + 3]).toBe(0);
    expect(cut.data[(60 * 200 + 60) * 4 + 3]).toBe(255);
  });

  it("가장자리에 묻은 분홍 번짐을 깎아낸다", () => {
    const img = onMagenta(200, 200, [[60, 60, 80, 80, [40, 60, 150]]]);
    // 대상 둘레 한 줄에 배경색이 섞인 화소
    for (let x = 59; x <= 140; x++) for (const y of [59, 140]) { const i = (y * 200 + x) * 4; img.data[i] = 200; img.data[i + 1] = 40; img.data[i + 2] = 215; }
    const cut = removeBackground(img);
    expect(opaqueBounds(cut)).toEqual({ x: 60, y: 60, w: 80, h: 80 });
  });
});

describe("팔레트 맞춤 축소", () => {
  it("결과의 모든 색이 팔레트에 있다", () => {
    const img = onMagenta(160, 160, [[20, 20, 120, 120, [137, 91, 52]], [50, 50, 40, 40, [30, 140, 160]]]);
    const ix = makeSprite(removeBackground(img), palette, { height: 30 });
    const out = indexedToImg(ix, palette);
    const allowed = new Set(palette.colors.map((c) => hexToRgb(c).join(",")));
    for (let i = 0; i < out.w * out.h; i++) {
      if (out.data[i * 4 + 3] === 0) continue;
      expect(allowed.has([out.data[i * 4], out.data[i * 4 + 1], out.data[i * 4 + 2]].join(","))).toBe(true);
    }
    expect(ix.h).toBe(30);
    expect(ix.w).toBe(30);
  });

  it("칸마다 가장 많은 색을 고른다 (평균을 내지 않는다)", () => {
    const img = createImg(40, 10);
    fill(img, 0, 0, 40, 10, [200, 40, 40]);
    fill(img, 0, 0, 3, 10, [40, 40, 200]); // 첫 칸의 30% 만 파랑
    const ix = downscaleToPalette(img, 4, 1, palette);
    expect(ix.idx[0]).toBe(ix.idx[1]);
  });

  it("색 수를 제한한다", () => {
    const img = createImg(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) fill(img, x, y, 1, 1, [x * 4, y * 4, 128]);
    const ix = limitColors(downscaleToPalette(img, 32, 32, palette), palette, 6);
    expect(countColors(ix)).toBeLessThanOrEqual(6);
  });

  it("외톨이 화소를 이웃 색으로 바꾼다", () => {
    const ix = createIndexed(5, 5);
    ix.idx.fill(10);
    ix.idx[12] = 40;
    expect(removeOrphans(ix).idx[12]).toBe(10);
  });

  it("윤곽은 안쪽보다 어둡다", () => {
    const ix = createIndexed(7, 7);
    for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) ix.idx[y * 7 + x] = 1 + 4; // 첫 계열의 다섯째 단계
    const out = inkOutline(ix, palette);
    expect(out.idx[3 * 7 + 3]).toBe(5);
    expect(out.idx[1 * 7 + 3]).toBe(3); // 위쪽 윤곽: 두 단계 어둡게
    expect(out.idx[5 * 7 + 3]).toBe(2); // 아래쪽 윤곽: 세 단계 어둡게
  });
});

describe("이어 붙이기", () => {
  it("이은 무늬는 좌우·상하 가장자리가 원본의 이웃과 이어진다", () => {
    const size = 24, band = 6;
    const src = createIndexed(size + band, size + band);
    // 가로 줄무늬 + 세로 줄무늬가 섞인 무늬
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) src.idx[y * src.w + x] = 1 + ((x >> 1) % 5) + 7 * ((y >> 1) % 3);
    const out = makeTileable(src, size, band);
    expect(out.w).toBe(size);
    // 띠 밖은 원본 그대로
    for (let y = band; y < size; y++) for (let x = band; x < size; x++) expect(out.idx[y * size + x]).toBe(src.idx[y * src.w + x]);
    // 맨 왼쪽 열은 대부분 원본의 (x + size) 열에서 온다 → 맨 오른쪽 열 바로 다음 화소와 같다
    let fromFar = 0;
    for (let y = band; y < size; y++) if (out.idx[y * size] === src.idx[y * src.w + size]) fromFar++;
    expect(fromFar).toBeGreaterThan((size - band) * 0.7);
  });
});

describe("캐릭터 시트", () => {
  it("세 방향 그림을 열로 나눈다", () => {
    const img = onMagenta(600, 200, [[40, 40, 100, 140, [200, 150, 60]], [250, 50, 90, 130, [200, 150, 60]], [450, 40, 100, 140, [200, 150, 60]]]);
    const boxes = splitColumns(removeBackground(img), 3);
    expect(boxes.map((b) => b.x)).toEqual([40, 250, 450]);
    expect(boxes[1].h).toBe(130);
  });

  it("걷기 프레임은 다리만 다르고 윗몸은 한 화소 안에서만 움직인다", () => {
    const body = createIndexed(12, 30);
    for (let y = 0; y < 30; y++) for (let x = 1; x < 11; x++) body.idx[y * 12 + x] = y < 10 ? 20 : y < 24 ? 30 : 40;
    const frame = placeInFrame(body, 16, 32);
    const frames = walkFrames(frame, "front");
    expect(frames.length).toBe(4);
    const count = (f: typeof frame, c: number) => f.idx.reduce((n, v) => n + (v === c ? 1 : 0), 0);
    // 머리(20)와 몸통(30) 화소 수는 모든 프레임에서 같다
    for (const f of frames) {
      expect(count(f, 20)).toBe(count(frame, 20));
      expect(count(f, 30)).toBeGreaterThanOrEqual(count(frame, 30) - 12);
    }
    // 디딘 프레임과 모은 프레임은 다르다
    expect(Array.from(frames[0].idx)).not.toEqual(Array.from(frames[1].idx));
    expect(Array.from(frames[1].idx)).toEqual(Array.from(frame.idx));
  });

  it("방향 3행 × 5열 시트를 만든다", () => {
    const v = createIndexed(10, 20);
    v.idx.fill(15);
    const s = buildCharacterSheet({ front: v, side: v, back: v }, "humanoid");
    expect(s.sheet.w).toBe(s.frameW * 5);
    expect(s.sheet.h).toBe(s.frameH * 3);
    expect(s.rows).toEqual(["down", "up", "side"]);
  });
});

describe("부호화", () => {
  it("PNG 로 쓰고 다시 읽으면 같은 화소다", async () => {
    const img = onMagenta(8, 8, [[2, 2, 4, 4, [10, 200, 30]]]);
    const back = await decode(await encodePng(img));
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
  });
});
