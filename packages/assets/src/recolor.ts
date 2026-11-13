import { hexToRgb, indexPalette, lchToRgb, nearestIndex, rgbToLab, type Ramp } from "@age/model";
import { decode, encodePng } from "./image";

export interface RecolorAdjust {
  /** 색상환에서 돌릴 각도. */
  hue: number;
  /** 채도 배율. 1 이면 그대로. */
  saturation: number;
  /** 밝기에 더할 값 (0~100 눈금, -40~40). */
  lightness: number;
}

/**
 * 그림의 색을 돌리고 다시 팔레트에 맞춘다 ("팔레트 교체").
 * 같은 색은 같은 색으로 가므로 명암 단계와 윤곽선이 유지된다. 먹색 윤곽선은 건드리지 않는다.
 */
export async function recolorPng(png: Uint8Array, ramps: Ramp[], adjust: RecolorAdjust): Promise<Buffer> {
  const img = await decode(png);
  const pal = indexPalette(ramps);
  const ink = rgbToLab(hexToRgb(pal.colors[0]));
  const map = new Map<number, [number, number, number]>();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let to = map.get(key);
    if (!to) {
      const [L, a, b] = rgbToLab([d[i], d[i + 1], d[i + 2]]);
      if (Math.hypot(L - ink[0], a - ink[1], b - ink[2]) < 0.02) to = [d[i], d[i + 1], d[i + 2]];
      else {
        const C = Math.hypot(a, b) * adjust.saturation;
        const h = (Math.atan2(b, a) * 180) / Math.PI + adjust.hue;
        const L2 = Math.max(0.02, Math.min(0.98, L + adjust.lightness / 100));
        const n = nearestIndex(pal, rgbToLab(lchToRgb(L2, C, h)));
        to = hexToRgb(pal.colors[n]);
      }
      map.set(key, to);
    }
    d[i] = to[0];
    d[i + 1] = to[1];
    d[i + 2] = to[2];
  }
  return encodePng(img);
}
