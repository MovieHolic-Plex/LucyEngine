// 그림 묶음을 크게 키워 한 장에 늘어놓는다 (눈으로 확인하는 용도).
//   pnpm exec tsx scripts/hand-sheet.ts hand tmp/hand.png [ids...]      손으로 그린 것
//   pnpm exec tsx scripts/hand-sheet.ts <png 폴더> tmp/x.png [ids...]    폴더의 <id>.png
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decode, encodePng, createImg, blit, scaleNearest, type Img } from "@age/assets";
import { HAND } from "../packages/assets/src/hand";
import { SPECS } from "../packages/assets/src/hand/specs";

const [src = "hand", out = "tmp/hand.png", ...ids] = process.argv.slice(2);
const K = Number(process.env.SCALE ?? 4);
const want = SPECS.filter((s) => !ids.length || ids.includes(s.id));
const items: Array<{ id: string; img: Img }> = [];
if (src === "hand") mkdirSync("spike/out/hand", { recursive: true });
for (const s of want) {
  let img: Img | null = null;
  if (src === "hand") {
    if (!HAND[s.id]) continue;
    let c = HAND[s.id]();
    if (s.kind === "prop" || s.kind === "building") c = c.trim();
    img = c.toImg();
    writeFileSync(`spike/out/hand/${s.id}.png`, await encodePng(img));
  } else if (existsSync(join(src, `${s.id}.png`))) img = await decode(readFileSync(join(src, `${s.id}.png`)));
  if (!img) continue;
  // 바닥 무늬는 한 귀퉁이만 보인다
  if (s.kind === "terrain" && process.env.FULL !== "1") {
    const cut = createImg(96, 96);
    blit(cut, img, 0, 0);
    img = cut;
  }
  items.push({ id: s.id, img: scaleNearest(img, K) });
}
const PAD = 12, W = Number(process.env.WIDTH ?? 1500);
let x = PAD, y = PAD, rowH = 0;
const place: Array<{ x: number; y: number; img: Img }> = [];
for (const it of items) {
  if (x + it.img.w + PAD > W && x > PAD) {
    x = PAD;
    y += rowH + PAD;
    rowH = 0;
  }
  place.push({ x, y, img: it.img });
  x += it.img.w + PAD;
  rowH = Math.max(rowH, it.img.h);
}
const sheet = createImg(W, y + rowH + PAD);
const bg = (process.env.BG ?? "#6f7a52").match(/\w\w/g)!.map((h) => parseInt(h, 16));
for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set([bg[0], bg[1], bg[2], 255], i);
for (const p of place) blit(sheet, p.img, p.x, p.y);
writeFileSync(out, await encodePng(sheet));
console.log(`${items.length} items → ${out} (${sheet.w}×${sheet.h})`);
