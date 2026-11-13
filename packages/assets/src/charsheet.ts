import { type Indexed, createIndexed } from "./pixelize";

/** 한 방향의 프레임 수: 서 있기 1 + 걷기 4. */
export const FRAMES_PER_DIR = 5;

function bounds(ix: Indexed): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = ix.w, y0 = ix.h, x1 = -1, y1 = -1;
  for (let y = 0; y < ix.h; y++)
    for (let x = 0; x < ix.w; x++)
      if (ix.idx[y * ix.w + x] >= 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function paste(dst: Indexed, src: Indexed, sx0: number, sy0: number, sx1: number, sy1: number, dx: number, dy: number): void {
  for (let y = sy0; y <= sy1; y++)
    for (let x = sx0; x <= sx1; x++) {
      const c = src.idx[y * src.w + x];
      if (c < 0) continue;
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      dst.idx[ty * dst.w + tx] = c;
    }
}

/** 프레임 칸 가운데 아래에 스프라이트를 놓는다. */
export function placeInFrame(sprite: Indexed, fw: number, fh: number): Indexed {
  const out = createIndexed(fw, fh);
  const b = bounds(sprite);
  if (!b) return out;
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  paste(out, sprite, b.x0, b.y0, b.x1, b.y1, Math.floor((fw - w) / 2) - b.x0, fh - h - b.y0);
  return out;
}

export type WalkView = "front" | "back" | "side";

/**
 * 서 있는 그림 한 장으로 걷기 네 프레임을 만든다.
 * 다리 구역을 좌우로 갈라 번갈아 들어 올리고, 발을 디딜 때 몸통을 한 화소 내린다.
 * 옆모습은 앞뒤 다리를 반대로 벌린다.
 */
export function walkFrames(frame: Indexed, view: WalkView): Indexed[] {
  const b = bounds(frame);
  if (!b) return [frame, frame, frame, frame];
  const h = b.y1 - b.y0 + 1;
  const legH = Math.max(3, Math.round(h * 0.2));
  const legTop = b.y1 - legH + 1;
  // 다리 구역의 좌우 중심
  let lx0 = frame.w, lx1 = -1;
  for (let y = legTop; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++)
      if (frame.idx[y * frame.w + x] >= 0) {
        if (x < lx0) lx0 = x;
        if (x > lx1) lx1 = x;
      }
  const mid = Math.floor((lx0 + lx1) / 2);
  const lift = h >= 30 ? 2 : 1;

  const make = (leftDy: number, rightDy: number, leftDx: number, rightDx: number, bodyDy: number): Indexed => {
    const out = createIndexed(frame.w, frame.h);
    paste(out, frame, b.x0, legTop, mid, b.y1, leftDx, leftDy);
    paste(out, frame, mid + 1, legTop, b.x1, b.y1, rightDx, rightDy);
    paste(out, frame, b.x0, b.y0, b.x1, legTop - 1, 0, bodyDy);
    return out;
  };

  if (view === "side") {
    return [make(0, -lift, -1, 1, 1), make(0, 0, 0, 0, 0), make(-lift, 0, 1, -1, 1), make(0, 0, 0, 0, 0)];
  }
  return [make(0, -lift, 0, 0, 1), make(0, 0, 0, 0, 0), make(-lift, 0, 0, 0, 1), make(0, 0, 0, 0, 0)];
}

/** 다리가 없는 생물용: 납작해졌다 늘어나는 네 프레임. */
export function hopFrames(frame: Indexed): Indexed[] {
  const b = bounds(frame);
  if (!b) return [frame, frame, frame, frame];
  const h = b.y1 - b.y0 + 1;
  const cut = b.y0 + Math.round(h * 0.45);
  const squash = createIndexed(frame.w, frame.h);
  paste(squash, frame, b.x0, cut + 1, b.x1, b.y1, 0, 0);
  paste(squash, frame, b.x0, b.y0, b.x1, cut - 1, 0, 1);
  const stretch = createIndexed(frame.w, frame.h);
  paste(stretch, frame, b.x0, cut, b.x1, b.y1, 0, 0);
  paste(stretch, frame, b.x0, b.y0, b.x1, cut, 0, -1);
  return [squash, frame, stretch, frame];
}

export interface CharacterViews {
  front: Indexed;
  /** 오른쪽을 보는 옆모습. 없으면 앞모습을 쓴다. */
  side?: Indexed;
  back?: Indexed;
}

export interface CharacterSheet {
  sheet: Indexed;
  frameW: number;
  frameH: number;
  /** 행 순서. 왼쪽은 실행기가 side 를 뒤집어 쓴다. */
  rows: Array<"down" | "up" | "side">;
  framesPerRow: number;
}

/** 방향별 [서 있기, 걷기 1~4] 를 행으로 쌓은 시트를 만든다. */
export function buildCharacterSheet(views: CharacterViews, kind: "humanoid" | "creature"): CharacterSheet {
  const all = [views.front, views.side ?? views.front, views.back ?? views.front];
  const maxW = Math.max(...all.map((v) => v.w)), maxH = Math.max(...all.map((v) => v.h));
  // 다리를 벌리거나 늘어날 여유
  const frameW = maxW + 4, frameH = maxH + 2;
  const rows: CharacterSheet["rows"] = ["down", "up", "side"];
  const perDir: Array<[Indexed, WalkView]> = [
    [views.front, "front"],
    [views.back ?? views.front, "back"],
    [views.side ?? views.front, "side"],
  ];
  const sheet = createIndexed(frameW * FRAMES_PER_DIR, frameH * rows.length);
  perDir.forEach(([view, kindOfView], r) => {
    const idle = placeInFrame(view, frameW, frameH);
    const frames = [idle, ...(kind === "humanoid" ? walkFrames(idle, kindOfView) : hopFrames(idle))];
    frames.forEach((f, c) => paste(sheet, f, 0, 0, frameW - 1, frameH - 1, c * frameW, r * frameH));
  });
  return { sheet, frameW, frameH, rows, framesPerRow: FRAMES_PER_DIR };
}
