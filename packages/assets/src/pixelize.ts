import { rgbToLab, hexToRgb, type Lab, type PaletteIndex, nearestIndex, darker, labDist } from "@age/model";
import { type Img, createImg, opaqueBounds, type BBox } from "./image";

/** 팔레트 번호 격자. -1 은 투명. */
export interface Indexed {
  w: number;
  h: number;
  idx: Int16Array;
}

export function createIndexed(w: number, h: number): Indexed {
  return { w, h, idx: new Int16Array(w * h).fill(-1) };
}

export function indexedToImg(ix: Indexed, p: PaletteIndex): Img {
  const out = createImg(ix.w, ix.h);
  const rgb = p.colors.map(hexToRgb);
  for (let i = 0; i < ix.idx.length; i++) {
    const c = ix.idx[i];
    if (c < 0) continue;
    out.data[i * 4] = rgb[c][0];
    out.data[i * 4 + 1] = rgb[c][1];
    out.data[i * 4 + 2] = rgb[c][2];
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, mx === 0 ? 0 : d / mx, mx / 255];
}

function hueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * 단색 배경을 투명하게 만든다. 배경색은 테두리 화소에서 추정한다.
 * 채도 높은 배경(마젠타 등)은 색상각으로, 무채색 배경은 색 거리로 판정한다.
 */
export function removeBackground(src: Img): Img {
  const { w, h } = src;
  const out: Img = { w, h, data: new Uint8ClampedArray(src.data) };
  const px = out.data;

  // 테두리에서 배경색 추정 (채널별 중앙값)
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const m = Math.max(2, Math.round(Math.min(w, h) * 0.015));
  for (let y = 0; y < h; y += 3)
    for (let x = 0; x < w; x += 3)
      if (x < m || y < m || x >= w - m || y >= h - m) {
        const i = (y * w + x) * 4;
        rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
      }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const bg: [number, number, number] = [med(rs), med(gs), med(bs)];
  const [bh, bsat] = hsv(...bg);
  const bgLab = rgbToLab(bg);
  const chroma = bsat > 0.35;

  // 0 = 전경, 1 = 배경과 느슨하게 비슷, 2 = 배경과 꼭 같음
  const like = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    if (chroma) {
      const [ph, ps, pv] = hsv(r, g, b);
      const dh = hueDiff(ph, bh);
      if (dh < 16 && ps > 0.5 && pv > 0.2) like[i] = 2;
      else if (dh < 30 && ps > 0.28 && pv > 0.1) like[i] = 1;
    } else {
      const d = labDist(rgbToLab([r, g, b]), bgLab);
      if (d < 0.0016) like[i] = 2;
      else if (d < 0.006) like[i] = 1;
    }
  }

  // 테두리에서 번져 들어가며 배경 지우기
  const gone = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!gone[i] && like[i]) { gone[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  // 안쪽에 갇힌 배경(다리 사이 등)은 꼭 같은 색만 지운다
  if (chroma) for (let i = 0; i < w * h; i++) if (like[i] === 2) gone[i] = 1;

  // 가장자리에 묻은 배경색 걷어내기: 투명 옆의 "느슨하게 비슷한" 화소를 두 번 깎는다
  for (let pass = 0; pass < 2; pass++) {
    const add: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (gone[i] || !like[i]) continue;
        if ((x > 0 && gone[i - 1]) || (x < w - 1 && gone[i + 1]) || (y > 0 && gone[i - w]) || (y < h - 1 && gone[i + w])) add.push(i);
      }
    for (const i of add) gone[i] = 1;
  }

  for (let i = 0; i < w * h; i++) px[i * 4 + 3] = gone[i] ? 0 : 255;
  return out;
}

/** 5비트 RGB 로 캐시한 팔레트 최근접 조회. */
export class PaletteLut {
  private cache = new Int16Array(32768).fill(-1);
  constructor(readonly palette: PaletteIndex, private allowed?: number[]) {}
  lookup(r: number, g: number, b: number): number {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let v = this.cache[key];
    if (v >= 0) return v;
    const lab = rgbToLab([(r & 0xf8) | 4, (g & 0xf8) | 4, (b & 0xf8) | 4]);
    if (this.allowed) {
      let bd = Infinity;
      for (const i of this.allowed) {
        const d = labDist(this.palette.labs[i], lab);
        if (d < bd) { bd = d; v = i; }
      }
    } else v = nearestIndex(this.palette, lab);
    this.cache[key] = v;
    return v;
  }
}

export interface DownscaleOptions {
  /** 원본에서 읽을 영역. 없으면 전체. */
  region?: BBox;
  /** 평균 쪽으로 대비를 눌러 조용한 바닥을 만든다 (0 = 그대로, 1 = 평평). */
  calm?: number;
  /** 한 칸이 불투명으로 인정되는 원본 불투명 비율. */
  coverage?: number;
  /** 넓은 범위의 색 얼룩을 걷어낸다 (0 = 그대로, 1 = 전부). 반복이 눈에 띄는 큰 무늬를 없앤다. */
  flatten?: number;
  /** 칸 가운데 이 비율만큼만 색을 센다 (1 = 칸 전체). 칸 경계에서 이웃 색이 섞이는 것을 줄인다. */
  focus?: number;
}

/**
 * 원본을 outW × outH 화소로 줄이며 팔레트에 맞춘다.
 * 칸마다 원본 화소를 팔레트로 옮긴 뒤 가장 많이 나온 색을 고른다 (평균을 내지 않아 흐려지지 않는다).
 */
export function downscaleToPalette(src: Img, outW: number, outH: number, palette: PaletteIndex, opts: DownscaleOptions = {}): Indexed {
  const region = opts.region ?? { x: 0, y: 0, w: src.w, h: src.h };
  const coverage = opts.coverage ?? 0.5;
  const calm = opts.calm ?? 0;
  const focus = opts.focus ?? 1;
  const flatten = opts.flatten ?? 0;
  const lut = new PaletteLut(palette);
  const out = createIndexed(outW, outH);
  const counts = new Uint16Array(palette.colors.length);

  // 평균 밝기. calm 은 색은 두고 밝기 차이만 누른다.
  let meanY = 0;
  if (calm > 0) {
    let n = 0;
    for (let y = region.y; y < region.y + region.h; y += 2)
      for (let x = region.x; x < region.x + region.w; x += 2) {
        const i = (y * src.w + x) * 4;
        if (src.data[i + 3] < 128) continue;
        meanY += 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]; n++;
      }
    if (n) meanY /= n;
  }

  // 굵은 격자로 본 구역별 평균색과 전체 평균색의 차이 (flatten 용)
  const G = 5;
  const coarse = [new Float32Array(G * G), new Float32Array(G * G), new Float32Array(G * G)];
  if (flatten > 0) {
    const cnt = new Float32Array(G * G);
    for (let y = region.y; y < region.y + region.h; y += 2)
      for (let x = region.x; x < region.x + region.w; x += 2) {
        const i = (y * src.w + x) * 4;
        if (src.data[i + 3] < 128) continue;
        const g = Math.min(G - 1, Math.floor(((y - region.y) * G) / region.h)) * G + Math.min(G - 1, Math.floor(((x - region.x) * G) / region.w));
        coarse[0][g] += src.data[i]; coarse[1][g] += src.data[i + 1]; coarse[2][g] += src.data[i + 2]; cnt[g]++;
      }
    for (const ch of coarse) {
      let sum = 0, n = 0;
      for (let g = 0; g < G * G; g++) if (cnt[g]) { ch[g] /= cnt[g]; sum += ch[g]; n++; }
      const avg = n ? sum / n : 0;
      for (let g = 0; g < G * G; g++) ch[g] = cnt[g] ? ch[g] - avg : 0;
    }
  }
  const localBias = (ch: Float32Array, x: number, y: number): number => {
    const gx = ((x - region.x) * G) / region.w - 0.5, gy = ((y - region.y) * G) / region.h - 0.5;
    const x0 = Math.max(0, Math.min(G - 1, Math.floor(gx))), y0 = Math.max(0, Math.min(G - 1, Math.floor(gy)));
    const x1 = Math.min(G - 1, x0 + 1), y1 = Math.min(G - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, gx - x0)), ty = Math.max(0, Math.min(1, gy - y0));
    const a = ch[y0 * G + x0], b = ch[y0 * G + x1], c = ch[y1 * G + x0], d = ch[y1 * G + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };

  for (let oy = 0; oy < outH; oy++) {
    const y0 = Math.floor(region.y + (oy * region.h) / outH), y1 = Math.max(y0 + 1, Math.floor(region.y + ((oy + 1) * region.h) / outH));
    for (let ox = 0; ox < outW; ox++) {
      const x0 = Math.floor(region.x + (ox * region.w) / outW), x1 = Math.max(x0 + 1, Math.floor(region.x + ((ox + 1) * region.w) / outW));
      counts.fill(0);
      let opaque = 0, total = 0;
      const mx = ((x1 - x0) * (1 - focus)) / 2, my = ((y1 - y0) * (1 - focus)) / 2;
      const fx0 = x0 + mx, fx1 = x1 - mx, fy0 = y0 + my, fy1 = y1 - my;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          total++;
          if (x < 0 || y < 0 || x >= src.w || y >= src.h) continue;
          const i = (y * src.w + x) * 4;
          if (src.data[i + 3] < 128) continue;
          opaque++;
          if (x + 0.5 < fx0 || x + 0.5 > fx1 || y + 0.5 < fy0 || y + 0.5 > fy1) continue;
          let r = src.data[i], g = src.data[i + 1], b = src.data[i + 2];
          if (flatten > 0) {
            r = Math.max(0, Math.min(255, r - localBias(coarse[0], x, y) * flatten));
            g = Math.max(0, Math.min(255, g - localBias(coarse[1], x, y) * flatten));
            b = Math.max(0, Math.min(255, b - localBias(coarse[2], x, y) * flatten));
          }
          if (calm > 0) {
            const shift = (meanY - (0.299 * r + 0.587 * g + 0.114 * b)) * calm;
            r = Math.max(0, Math.min(255, r + shift)); g = Math.max(0, Math.min(255, g + shift)); b = Math.max(0, Math.min(255, b + shift));
          }
          counts[lut.lookup(r | 0, g | 0, b | 0)]++;
        }
      if (opaque < total * coverage) continue;
      let best = 0, bc = -1;
      for (let c = 0; c < counts.length; c++) if (counts[c] > bc) { bc = counts[c]; best = c; }
      out.idx[oy * outW + ox] = best;
    }
  }
  return out;
}

/** 가장 많이 쓰인 색 maxColors 개만 남기고 나머지는 남은 색 중 가까운 색으로 옮긴다. */
export function limitColors(ix: Indexed, palette: PaletteIndex, maxColors: number): Indexed {
  const counts = new Map<number, number>();
  for (const c of ix.idx) if (c >= 0) counts.set(c, (counts.get(c) ?? 0) + 1);
  if (counts.size <= maxColors) return ix;
  const keep = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxColors).map(([c]) => c);
  const remap = new Map<number, number>();
  for (const c of counts.keys()) {
    if (keep.includes(c)) { remap.set(c, c); continue; }
    let best = keep[0], bd = Infinity;
    for (const k of keep) {
      const d = labDist(palette.labs[k], palette.labs[c]);
      if (d < bd) { bd = d; best = k; }
    }
    remap.set(c, best);
  }
  const out = createIndexed(ix.w, ix.h);
  for (let i = 0; i < ix.idx.length; i++) out.idx[i] = ix.idx[i] < 0 ? -1 : remap.get(ix.idx[i])!;
  return out;
}

/** 네 이웃 어느 것과도 색이 다른 외톨이 화소를 이웃에서 가장 흔한 색으로 바꾸고, 외톨이 불투명 화소는 지운다. */
export function removeOrphans(ix: Indexed): Indexed {
  const { w, h } = ix;
  const out = createIndexed(w, h);
  out.idx.set(ix.idx);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = ix.idx[y * w + x];
      if (c < 0) continue;
      const n = [
        x > 0 ? ix.idx[y * w + x - 1] : -1,
        x < w - 1 ? ix.idx[y * w + x + 1] : -1,
        y > 0 ? ix.idx[(y - 1) * w + x] : -1,
        y < h - 1 ? ix.idx[(y + 1) * w + x] : -1,
      ];
      if (n.every((v) => v < 0)) { out.idx[y * w + x] = -1; continue; }
      if (n.some((v) => v === c)) continue;
      const tally = new Map<number, number>();
      for (const v of n) if (v >= 0) tally.set(v, (tally.get(v) ?? 0) + 1);
      let best = c, bc = 1;
      for (const [v, k] of tally) if (k > bc) { bc = k; best = v; }
      out.idx[y * w + x] = best;
    }
  return out;
}

/** 윤곽(투명과 맞닿은 화소)을 같은 색 띠의 어두운 색으로 다시 긋는다. 아래·오른쪽은 한 단계 더 어둡게. */
export function inkOutline(ix: Indexed, palette: PaletteIndex, steps = 2): Indexed {
  const { w, h } = ix;
  const out = createIndexed(w, h);
  out.idx.set(ix.idx);
  const clear = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || ix.idx[y * w + x] < 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = ix.idx[y * w + x];
      if (c < 0) continue;
      const lit = clear(x - 1, y) || clear(x, y - 1);
      const shade = clear(x + 1, y) || clear(x, y + 1);
      if (!lit && !shade) continue;
      out.idx[y * w + x] = darker(palette, c, shade ? steps + 1 : steps);
    }
  return out;
}

export interface SpriteOptions {
  /** 결과 높이(화소). width 와 둘 중 하나만 준다. */
  height?: number;
  width?: number;
  maxColors?: number;
  outline?: boolean;
  /** 이 상자를 기준으로 비율을 맞춘다 (여러 그림을 같은 축척으로 줄일 때). */
  region?: BBox;
  focus?: number;
}

/** 배경을 지운 원본에서 내용만 잘라 목표 크기의 스프라이트로 만든다. */
export function makeSprite(cut: Img, palette: PaletteIndex, opts: SpriteOptions): Indexed {
  const box = opts.region ?? opaqueBounds(cut);
  if (!box) return createIndexed(1, 1);
  const scale = opts.height ? opts.height / box.h : (opts.width ?? box.w) / box.w;
  const outW = Math.max(1, Math.round(box.w * scale)), outH = Math.max(1, Math.round(box.h * scale));
  let ix = downscaleToPalette(cut, outW, outH, palette, { region: box, focus: opts.focus ?? 0.6 });
  if (opts.maxColors) ix = limitColors(ix, palette, opts.maxColors);
  ix = removeOrphans(ix);
  if (opts.outline !== false) ix = inkOutline(ix, palette);
  return ix;
}

/** 불투명 화소가 있는 열의 연속 구간으로 그림을 나눈다 (캐릭터 세 방향 시트 등). 넓은 순으로 count 개를 왼쪽부터 돌려준다. */
export function splitColumns(cut: Img, count: number): BBox[] {
  const { w, h } = cut;
  const colHas = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cut.data[(y * w + x) * 4 + 3] >= 128) colHas[x]++;
  const minFill = Math.max(1, Math.round(h * 0.004));
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let x = 0; x <= w; x++) {
    const on = x < w && colHas[x] >= minFill;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  // 아주 좁은 틈은 같은 덩어리로 본다
  const merged: Array<[number, number]> = [];
  const gap = Math.round(w * 0.012);
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] <= gap) last[1] = r[1];
    else merged.push([...r]);
  }
  const top = merged.sort((a, b) => b[1] - b[0] - (a[1] - a[0])).slice(0, count).sort((a, b) => a[0] - b[0]);
  return top.map(([x0, x1]) => {
    let y0 = h, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = x0; x <= x1; x++)
        if (cut.data[(y * w + x) * 4 + 3] >= 128) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  });
}

function hash2(x: number, y: number, seed: number): number {
  let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * (size + band) 정사각 무늬를 size 정사각의 이어 붙일 수 있는 무늬로 만든다.
 * 가장자리 띠에서 반대편 화소를 확률적으로 골라 섞는다 (평균을 내지 않는다).
 */
export function makeTileable(ix: Indexed, size: number, band: number): Indexed {
  const out = createIndexed(size, size);
  const at = (x: number, y: number) => ix.idx[Math.min(ix.h - 1, y) * ix.w + Math.min(ix.w - 1, x)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let sx = x, sy = y;
      if (x < band && hash2(x, y, 1) > (x + 0.5) / band) sx = x + size;
      if (y < band && hash2(x, y, 2) > (y + 0.5) / band) sy = y + size;
      out.idx[y * size + x] = at(sx, sy);
    }
  return out;
}

export function countColors(ix: Indexed): number {
  const s = new Set<number>();
  for (const c of ix.idx) if (c >= 0) s.add(c);
  return s.size;
}

export function paletteLab(palette: PaletteIndex, i: number): Lab {
  return palette.labs[i];
}
