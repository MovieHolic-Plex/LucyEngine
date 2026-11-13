import { Canvas, col, rng, type Family } from "./kit";

// 바닥 무늬. 6×6 타일(144px) 크기로 만들어 반복이 눈에 덜 띄게 하고, 모든 것을 감싸서 이음매가 없게 한다.
// 화소마다 잡음을 뿌리지 않는다. 넓은 면은 평평하게 두고, 덩어리와 작은 표식으로만 변화를 준다.

export const TEX = 144;

/** 가장자리가 이어지는 부드러운 잡음 (0~1). cells 는 한 변의 격자 수. */
export function wrapNoise(cells: number, seed: number): (x: number, y: number) => number {
  const r = rng(seed);
  const g = Array.from({ length: cells * cells }, () => r());
  const at = (i: number, j: number) => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / TEX) * cells, fy = (y / TEX) * cells;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = s(fx - i), ty = s(fy - j);
    return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
  };
}

export class Tex extends Canvas {
  constructor() {
    super(TEX, TEX);
  }
  /** 감싸서 찍는다. */
  wset(x: number, y: number, c: string): void {
    this.set(((Math.round(x) % TEX) + TEX) % TEX, ((Math.round(y) % TEX) + TEX) % TEX, c);
  }
  wget(x: number, y: number): string | null {
    return this.get(((x % TEX) + TEX) % TEX, ((y % TEX) + TEX) % TEX);
  }
  fill(f: (x: number, y: number) => string): this {
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) this.set(x, y, f(x, y));
    return this;
  }
}

/** 겹치지 않게 흩어 놓은 자리들. 격자를 흔들어 고르게 퍼지되 줄 서 보이지 않게 한다. */
export function scatter(step: number, seed: number, keep = 1): Array<{ x: number; y: number; r: number }> {
  const r = rng(seed);
  const out: Array<{ x: number; y: number; r: number }> = [];
  for (let y = 0; y < TEX; y += step)
    for (let x = 0; x < TEX; x += step) {
      const jx = r(), jy = r(), pick = r(), v = r();
      if (pick > keep) continue;
      out.push({ x: Math.floor(x + jx * (step - 2)), y: Math.floor(y + jy * (step - 2)), r: v });
    }
  return out;
}

export function grass(): Canvas {
  const t = new Tex();
  const big = wrapNoise(5, 11), mid = wrapNoise(12, 12), fine = wrapNoise(36, 13);
  const base = col("leaf", 3), dark = col("green", 3), light = col("leaf", 4);
  // 넓은 얼룩: 같은 밝기의 서늘한 풀과, 드문 밝은 풀이 덩어리로 섞인다. 가장자리는 잔 잡음으로 흩뜨린다.
  t.fill((x, y) => {
    const n = big(x, y) * 0.55 + mid(x, y) * 0.3 + fine(x, y) * 0.15;
    return n < 0.43 ? dark : n > 0.66 ? light : base;
  });
  // 풀 포기: 짧은 날 두세 개가 모인 표식
  for (const p of scatter(9, 21, 0.8)) {
    const on = t.wget(p.x, p.y);
    const blade = on === light ? col("leaf", 5) : light;
    const root = col("green", 2);
    if (p.r < 0.4) {
      t.wset(p.x, p.y, blade);
      t.wset(p.x + 2, p.y, blade);
      t.wset(p.x + 1, p.y + 1, root);
    } else if (p.r < 0.75) {
      t.wset(p.x, p.y, blade);
      t.wset(p.x, p.y + 1, blade);
      t.wset(p.x + 2, p.y + 1, blade);
      t.wset(p.x + 1, p.y + 2, root);
    } else {
      t.wset(p.x, p.y + 1, root);
      t.wset(p.x + 1, p.y, root);
    }
  }
  // 드문드문 작은 꽃
  for (const p of scatter(36, 31, 0.55)) {
    const c = p.r < 0.5 ? col("gold", 6) : col("rose", 6);
    t.wset(p.x, p.y, c);
    t.wset(p.x + 1, p.y, c);
    t.wset(p.x, p.y + 1, col("leaf", 2));
  }
  return t;
}

export function dirt(): Canvas {
  const t = new Tex();
  const big = wrapNoise(5, 41), mid = wrapNoise(12, 42), fine = wrapNoise(36, 43);
  const base = col("wood", 2), dark = col("rustM", 2), light = col("wood", 3);
  t.fill((x, y) => {
    const n = big(x, y) * 0.55 + mid(x, y) * 0.3 + fine(x, y) * 0.15;
    return n < 0.4 ? dark : n > 0.68 ? light : base;
  });
  // 자갈: 밝은 윗면과 그 아래 그림자
  for (const p of scatter(12, 51, 0.6)) {
    const on = t.wget(p.x, p.y);
    const top = on === light ? col("stone", 5) : col("stone", 4);
    t.wset(p.x, p.y, top);
    if (p.r > 0.45) t.wset(p.x + 1, p.y, top);
    t.wset(p.x, p.y + 1, col("rustM", 1));
    if (p.r > 0.45) t.wset(p.x + 1, p.y + 1, col("rustM", 1));
  }
  // 마른 흙의 짧은 금
  for (const p of scatter(24, 52, 0.6)) {
    const len = 3 + Math.floor(p.r * 4);
    for (let i = 0; i < len; i++) t.wset(p.x + i, p.y + (i > len / 2 ? 1 : 0), col("rustM", 1));
  }
  return t;
}

export function pavement(): Canvas {
  const t = new Tex();
  const stain = wrapNoise(5, 61);
  const r = rng(62);
  const SLAB = 24;
  // 판마다 밝기가 조금씩 다르다
  const tones = Array.from({ length: 36 }, () => (r() < 0.16 ? 4 : 3));
  const fam: Family = "stone";
  for (let sy = 0; sy < 6; sy++)
    for (let sx = 0; sx < 6; sx++) {
      const tone = tones[sy * 6 + sx];
      const x0 = sx * SLAB, y0 = sy * SLAB;
      for (let y = 0; y < SLAB; y++)
        for (let x = 0; x < SLAB; x++) {
          let c = col(fam, stain(x0 + x, y0 + y) < 0.27 ? tone - 1 : tone);
          if (x === SLAB - 1 || y === SLAB - 1) c = col(fam, 1); // 줄눈
          else if (x === 0 || y === 0) c = col(fam, tone + 1); // 빛 받는 모서리
          else if (x === SLAB - 2 || y === SLAB - 2) c = col(fam, tone - 1); // 그늘진 모서리
          t.set(x0 + x, y0 + y, c);
        }
      // 일부 판은 둘로 갈라져 있다
      if (r() < 0.28) {
        const vertical = r() < 0.5, at = 9 + Math.floor(r() * 6);
        for (let i = 1; i < SLAB - 1; i++) {
          const wob = i > 8 && i < 16 ? 1 : 0;
          if (vertical) t.set(x0 + at + wob, y0 + i, col(fam, 1));
          else t.set(x0 + i, y0 + at + wob, col(fam, 1));
        }
      }
      // 모서리가 깨진 판
      if (r() < 0.3) {
        const cx = r() < 0.5 ? 1 : SLAB - 5, cy = r() < 0.5 ? 1 : SLAB - 5;
        t.set(x0 + cx, y0 + cy, col(fam, 1)).set(x0 + cx + 1, y0 + cy, col(fam, 1)).set(x0 + cx, y0 + cy + 1, col(fam, 1));
        t.set(x0 + cx + 2, y0 + cy, col(fam, 2)).set(x0 + cx + 1, y0 + cy + 1, col(fam, 2));
      }
    }
  // 줄눈에 낀 풀과 이끼
  for (const p of scatter(16, 63, 0.7)) {
    const x = Math.round(p.x / SLAB) * SLAB - 1, y = p.y;
    const g = p.r < 0.5 ? col("leaf", 3) : col("green", 2);
    t.wset(x, y, g);
    t.wset(x, y + 1, g);
    if (p.r > 0.6) t.wset(x + 1, y, col("leaf", 4));
    if (p.r < 0.3) t.wset(x - 1, y + 1, col("green", 2));
  }
  for (const p of scatter(20, 64, 0.5)) {
    const y = Math.round(p.y / SLAB) * SLAB - 1;
    t.wset(p.x, y, col("leaf", 3));
    t.wset(p.x + 1, y, col("green", 2));
    if (p.r > 0.5) t.wset(p.x + 1, y - 1, col("leaf", 4));
  }
  return t;
}

export function water(): Canvas {
  const t = new Tex();
  const big = wrapNoise(3, 71), mid = wrapNoise(7, 72);
  const base = col("teal", 2), deep = col("tealM", 1), light = col("teal", 3);
  t.fill((x, y) => {
    const n = big(x, y) * 0.7 + mid(x, y) * 0.3;
    return n < 0.42 ? deep : n > 0.72 ? light : base;
  });
  // 잔물결: 가로로 짧게 끊긴 밝은 선
  for (const p of scatter(13, 73, 0.75)) {
    const len = 3 + Math.floor(p.r * 5);
    for (let i = 0; i < len; i++) t.wset(p.x + i, p.y, i === 0 || i === len - 1 ? light : col("teal", 4));
    if (p.r > 0.7) for (let i = 1; i < len - 2; i++) t.wset(p.x + i + 2, p.y + 2, light);
  }
  for (const p of scatter(48, 74, 0.5)) t.wset(p.x, p.y, col("teal", 6));
  return t;
}

export function planks(): Canvas {
  const t = new Tex();
  const r = rng(81);
  const W = 12;
  for (let bx = 0; bx < TEX / W; bx++) {
    let y = -Math.floor(r() * 30);
    while (y < TEX) {
      const len = 30 + Math.floor(r() * 30);
      const tone = r() < 0.25 ? 4 : r() < 0.35 ? 2 : 3;
      for (let j = 0; j < len; j++)
        for (let i = 0; i < W; i++) {
          const yy = y + j;
          if (yy < 0 || yy >= TEX) continue;
          let c = col("wood", tone);
          if (i === W - 1 || j === len - 1) c = col("wood", 1);
          else if (i === 0) c = col("wood", tone + 1);
          else if ((i === 4 || i === 8) && (j * 7 + bx * 3) % 11 < 7) c = col("wood", tone - 1); // 나뭇결
          t.set(bx * W + i, yy, c);
        }
      // 못
      if (y + 2 >= 0 && y + 2 < TEX) t.set(bx * W + 5, y + 2, col("stone", 5));
      y += len;
    }
  }
  return t;
}
