import { lchToRgb, rgbToHex, hexToRgb, rgbToLab, labDist, type Lab } from "./color";

/** 한 색 계열의 어두운 색 → 밝은 색 순서. */
export type Ramp = string[];

export interface PaletteSpec {
  /** 전체 색상각을 돌리는 값(도). */
  hueShift?: number;
  /** 채도 배율. */
  chroma?: number;
  /** 어두운 쪽이 끌려가는 색상각(도). */
  shadowHue?: number;
  /** 밝은 쪽이 끌려가는 색상각(도). */
  lightHue?: number;
}

const FAMILIES: Array<{ name: string; hue: number; chroma: number }> = [
  { name: "rust", hue: 32, chroma: 0.135 },
  { name: "orange", hue: 58, chroma: 0.135 },
  { name: "gold", hue: 88, chroma: 0.125 },
  { name: "leaf", hue: 128, chroma: 0.105 },
  { name: "green", hue: 152, chroma: 0.11 },
  { name: "teal", hue: 196, chroma: 0.085 },
  { name: "blue", hue: 246, chroma: 0.1 },
  { name: "violet", hue: 302, chroma: 0.09 },
  { name: "rose", hue: 8, chroma: 0.11 },
  { name: "skin", hue: 52, chroma: 0.062 },
  { name: "wood", hue: 62, chroma: 0.072 },
  { name: "stone", hue: 78, chroma: 0.018 },
  { name: "steel", hue: 250, chroma: 0.024 },
  // 채도를 낮춘 계열 (바랜 페인트, 세이지 잎, 흐린 하늘)
  { name: "rust-muted", hue: 32, chroma: 0.062 },
  { name: "gold-muted", hue: 88, chroma: 0.06 },
  { name: "leaf-muted", hue: 132, chroma: 0.052 },
  { name: "green-muted", hue: 160, chroma: 0.05 },
  { name: "teal-muted", hue: 200, chroma: 0.042 },
  { name: "blue-muted", hue: 246, chroma: 0.05 },
  { name: "violet-muted", hue: 300, chroma: 0.045 },
  { name: "rose-muted", hue: 8, chroma: 0.05 },
];

const LIGHTNESS = [0.2, 0.31, 0.43, 0.55, 0.68, 0.8, 0.9];
const CHROMA_CURVE = [0.62, 0.85, 1, 1, 0.9, 0.66, 0.42];

function mixHue(from: number, to: number, t: number): number {
  const d = ((to - from + 540) % 360) - 180;
  return (from + d * t + 360) % 360;
}

/** 색상을 조금씩 돌린 계열별 명암 띠로 팔레트를 만든다. 어두울수록 차갑게, 밝을수록 따뜻하게. */
export function buildPalette(spec: PaletteSpec = {}): Ramp[] {
  const { hueShift = 0, chroma = 1, shadowHue = 268, lightHue = 82 } = spec;
  const ramps = FAMILIES.map((f) =>
    LIGHTNESS.map((L, i) => {
      const t = i / (LIGHTNESS.length - 1);
      const base = (f.hue + hueShift + 360) % 360;
      const hue = t < 0.5 ? mixHue(base, shadowHue, (0.5 - t) * 0.42) : mixHue(base, lightHue, (t - 0.5) * 0.3);
      return rgbToHex(lchToRgb(L, f.chroma * chroma * CHROMA_CURVE[i], hue));
    }),
  );
  return ramps;
}

export const INK = "#17131f";
export const PAPER = "#fbf3e2";

export function flattenPalette(ramps: Ramp[]): string[] {
  return [INK, ...ramps.flat(), PAPER];
}

export interface PaletteIndex {
  colors: string[];
  labs: Lab[];
  /** 색 번호 → [띠 번호, 띠 안 위치]. 먹색·종이색은 -1. */
  rampOf: Array<[number, number]>;
  ramps: Ramp[];
}

export function indexPalette(ramps: Ramp[]): PaletteIndex {
  const colors = flattenPalette(ramps);
  const rampOf: Array<[number, number]> = [[-1, 0]];
  ramps.forEach((r, ri) => r.forEach((_, ci) => rampOf.push([ri, ci])));
  rampOf.push([-1, 0]);
  return { colors, labs: colors.map((c) => rgbToLab(hexToRgb(c))), rampOf, ramps };
}

export function nearestIndex(p: PaletteIndex, lab: Lab): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < p.labs.length; i++) {
    const d = labDist(p.labs[i], lab);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** 같은 띠에서 steps 만큼 어두운 색. 띠 끝이면 먹색. */
export function darker(p: PaletteIndex, index: number, steps: number): number {
  const [ri, ci] = p.rampOf[index];
  if (ri < 0) return 0;
  const t = ci - steps;
  if (t < 0) return 0;
  return 1 + ri * p.ramps[0].length + t;
}
