// 폴더 안 PNG 들을 확대해 한 장에 늘어놓는다 (검수용).
import { readdir, readFile, writeFile } from "node:fs/promises";
import { decode, encodePng, createImg, scaleNearest, type Img } from "@age/assets";
const [dir, outPath, kStr = "4", bg = "58,62,70", filter = ""] = process.argv.slice(2);
const k = Number(kStr);
const [br, bgc, bb] = bg.split(",").map(Number);
const files = (await readdir(dir)).filter((f) => f.endsWith(".png") && !f.startsWith("_") && (!filter || new RegExp(filter).test(f))).sort();
const imgs: Array<{ name: string; img: Img }> = [];
for (const f of files) imgs.push({ name: f, img: scaleNearest(await decode(await readFile(`${dir}/${f}`)), k) });
const pad = 12, maxW = 1500;
let x = pad, y = pad, rowH = 0;
const pos: Array<[number, number]> = [];
for (const { img } of imgs) {
  if (x + img.w + pad > maxW) { x = pad; y += rowH + pad; rowH = 0; }
  pos.push([x, y]); x += img.w + pad; rowH = Math.max(rowH, img.h);
}
const sheet = createImg(maxW, y + rowH + pad);
for (let i = 0; i < sheet.w * sheet.h; i++) { sheet.data[i * 4] = br; sheet.data[i * 4 + 1] = bgc; sheet.data[i * 4 + 2] = bb; sheet.data[i * 4 + 3] = 255; }
imgs.forEach(({ img }, n) => {
  const [px, py] = pos[n];
  for (let j = 0; j < img.h; j++) for (let i = 0; i < img.w; i++) {
    const s = (j * img.w + i) * 4; if (img.data[s + 3] < 128) continue;
    const d = ((py + j) * sheet.w + px + i) * 4;
    sheet.data[d] = img.data[s]; sheet.data[d + 1] = img.data[s + 1]; sheet.data[d + 2] = img.data[s + 2];
  }
});
await writeFile(outPath, await encodePng(sheet));
console.log(files.join(" "));
