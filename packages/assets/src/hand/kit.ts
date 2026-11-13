import { buildPalette, hexToRgb, indexPalette, darker, INK, type PaletteIndex } from "@age/model";
import type { Img } from "../image";

// 손으로 찍는 도트를 위한 작은 도구. 색은 항상 프로젝트 팔레트에서 고른다.

const FAMILY = ["rust", "orange", "gold", "leaf", "green", "teal", "blue", "violet", "rose", "skin", "wood", "stone", "steel", "rustM", "goldM", "leafM", "greenM", "tealM", "blueM", "violetM", "roseM"] as const;
export type Family = (typeof FAMILY)[number];

const ramps = buildPalette();
export const palette: PaletteIndex = indexPalette(ramps);
const indexOfHex = new Map(palette.colors.map((c, i) => [c.toLowerCase(), i]));

/** 팔레트 색. tone 0 이 가장 어둡고 6 이 가장 밝다. */
export function col(family: Family, tone: number): string {
  return ramps[FAMILY.indexOf(family)][Math.max(0, Math.min(6, Math.round(tone)))];
}
export const ink = INK;
export const paper = palette.colors[palette.colors.length - 1];

/** 같은 계열에서 steps 만큼 어두운 색. */
export function shade(hex: string, steps: number): string {
  const i = indexOfHex.get(hex.toLowerCase());
  if (i === undefined) return ink;
  return palette.colors[darker(palette, i, steps)];
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Canvas {
  readonly px: Array<string | null>;

  constructor(readonly w: number, readonly h: number) {
    this.px = new Array(w * h).fill(null);
  }

  get(x: number, y: number): string | null {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y * this.w + x];
  }

  set(x: number, y: number, c: string | null): this {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
    return this;
  }

  /** 이미 칠해진 곳에만 칠한다 (무늬·명암을 형태 안에 가둘 때). */
  over(x: number, y: number, c: string): this {
    if (this.get(Math.round(x), Math.round(y))) this.set(x, y, c);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: string | null): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  hline(x0: number, x1: number, y: number, c: string): this {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
    return this;
  }

  vline(x: number, y0: number, y1: number, c: string): this {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string): this {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
    return this;
  }

  /** 가운데와 반지름으로 채운 타원. 반지름에 .5 를 주면 짝수 폭이 된다. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string | ((x: number, y: number, nx: number, ny: number) => string | null)): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        if (nx * nx + ny * ny > 1.0001) continue;
        const v = typeof c === "function" ? c(x, y, nx, ny) : c;
        if (v) this.set(x, y, v);
      }
    return this;
  }

  /** 행마다 [왼쪽, 오른쪽] 을 주는 형태를 채운다. */
  rows(y: number, spans: Array<[number, number]>, c: string | ((x: number, y: number) => string)): this {
    spans.forEach(([a, b], j) => {
      for (let x = a; x <= b; x++) this.set(x, y + j, typeof c === "function" ? c(x, y + j) : c);
    });
    return this;
  }

  /** 글자 그림을 찍는다. 빈칸과 '.' 은 건너뛴다. 줄 길이가 다르면 틀린 그림이므로 멈춘다. */
  stamp(x: number, y: number, art: string[], legend: Record<string, string | null>): this {
    const w = art[0]?.length ?? 0;
    art.forEach((row, j) => {
      if (row.length !== w) throw new Error(`stamp: row ${j} has ${row.length} chars, expected ${w}: "${row}"`);
      [...row].forEach((ch, i) => {
        if (ch === "." || ch === " ") return;
        if (!(ch in legend)) throw new Error(`stamp: unknown key "${ch}"`);
        this.set(x + i, y + j, legend[ch]);
      });
    });
    return this;
  }

  blit(src: Canvas, dx: number, dy: number, flip = false): this {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.px[y * src.w + (flip ? src.w - 1 - x : x)];
        if (c) this.set(dx + x, dy + y, c);
      }
    return this;
  }

  /**
   * 바깥 윤곽선. 형태에 닿은 빈 화소를, 닿은 색보다 어두운 같은 계열 색으로 칠한다 (먹선 하나로 두르지 않는다).
   * 아래·오른쪽은 더 어둡게 해서 왼쪽 위에서 오는 빛을 따른다.
   */
  outline(steps = 3): this {
    const add: Array<[number, number, string]> = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        const below = this.get(x, y + 1), right = this.get(x + 1, y), above = this.get(x, y - 1), left = this.get(x - 1, y);
        const lit = below ?? right;
        const dark = above ?? left;
        if (lit) add.push([x, y, shade(lit, steps)]);
        else if (dark) add.push([x, y, shade(dark, steps + 1)]);
      }
    for (const [x, y, c] of add) this.set(x, y, c);
    return this;
  }

  bounds(): { x: number; y: number; w: number; h: number } {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.px[y * this.w + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** 빈 둘레를 잘라낸다. */
  trim(): Canvas {
    const b = this.bounds();
    const out = new Canvas(b.w, b.h);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) out.px[y * b.w + x] = this.px[(b.y + y) * this.w + b.x + x];
    return out;
  }

  toImg(): Img {
    const data = new Uint8ClampedArray(this.w * this.h * 4);
    this.px.forEach((c, i) => {
      if (!c) return;
      const [r, g, b] = hexToRgb(c);
      data.set([r, g, b, 255], i * 4);
    });
    return { w: this.w, h: this.h, data };
  }
}

/** 프레임들을 가로로 이어 한 줄을 만든다. 모두 같은 크기여야 한다. */
export function strip(frames: Canvas[]): Canvas {
  const w = frames[0].w, h = frames[0].h;
  const out = new Canvas(w * frames.length, h);
  frames.forEach((f, i) => out.blit(f, i * w, 0));
  return out;
}

export function stack(rows: Canvas[]): Canvas {
  const out = new Canvas(rows[0].w, rows.reduce((n, r) => n + r.h, 0));
  let y = 0;
  for (const r of rows) {
    out.blit(r, 0, y);
    y += r.h;
  }
  return out;
}
