import sharp from "sharp";

/** RGBA 8비트 화소 버퍼. */
export interface Img {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export function createImg(w: number, h: number): Img {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

export async function decode(buf: Buffer | Uint8Array): Promise<Img> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) };
}

export async function encodePng(img: Img): Promise<Buffer> {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
    raw: { width: img.w, height: img.h, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export function crop(img: Img, x: number, y: number, w: number, h: number): Img {
  const out = createImg(w, h);
  for (let j = 0; j < h; j++) {
    const sy = y + j;
    if (sy < 0 || sy >= img.h) continue;
    for (let i = 0; i < w; i++) {
      const sx = x + i;
      if (sx < 0 || sx >= img.w) continue;
      const s = (sy * img.w + sx) * 4, d = (j * w + i) * 4;
      out.data[d] = img.data[s];
      out.data[d + 1] = img.data[s + 1];
      out.data[d + 2] = img.data[s + 2];
      out.data[d + 3] = img.data[s + 3];
    }
  }
  return out;
}

/** src 를 dst 의 (dx, dy) 에 알파를 살려 얹는다. */
export function blit(dst: Img, src: Img, dx: number, dy: number): void {
  for (let j = 0; j < src.h; j++) {
    const y = dy + j;
    if (y < 0 || y >= dst.h) continue;
    for (let i = 0; i < src.w; i++) {
      const x = dx + i;
      if (x < 0 || x >= dst.w) continue;
      const s = (j * src.w + i) * 4;
      if (src.data[s + 3] < 128) continue;
      const d = (y * dst.w + x) * 4;
      dst.data[d] = src.data[s];
      dst.data[d + 1] = src.data[s + 1];
      dst.data[d + 2] = src.data[s + 2];
      dst.data[d + 3] = 255;
    }
  }
}

export function flipH(img: Img): Img {
  const out = createImg(img.w, img.h);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 4, d = (y * img.w + (img.w - 1 - x)) * 4;
      out.data[d] = img.data[s];
      out.data[d + 1] = img.data[s + 1];
      out.data[d + 2] = img.data[s + 2];
      out.data[d + 3] = img.data[s + 3];
    }
  return out;
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 불투명 화소를 감싸는 상자. 전부 투명이면 null. */
export function opaqueBounds(img: Img): BBox | null {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[(y * img.w + x) * 4 + 3] >= 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** 최근접 확대. 검수용 그림에 쓴다. */
export function scaleNearest(img: Img, k: number): Img {
  const out = createImg(img.w * k, img.h * k);
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) {
      const s = (Math.floor(y / k) * img.w + Math.floor(x / k)) * 4, d = (y * out.w + x) * 4;
      out.data[d] = img.data[s];
      out.data[d + 1] = img.data[s + 1];
      out.data[d + 2] = img.data[s + 2];
      out.data[d + 3] = img.data[s + 3];
    }
  return out;
}
