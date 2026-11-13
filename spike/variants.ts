// 같은 원본을 후처리 설정만 바꿔 나란히 놓는다.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildPalette, indexPalette } from "@age/model";
import { decode, encodePng, removeBackground, makeSprite, indexedToImg, splitColumns } from "@age/assets";
const palette = indexPalette(buildPalette());
const dir = "spike/out/a-r2", out = "spike/out/variants";
await mkdir(out, { recursive: true });
const items: Array<[string, number, number]> = [["p_barrel", 30, 36], ["p_vending", 46, 58], ["p_sign", 36, 44], ["p_bench", 22, 30], ["p_crate", 26, 30], ["c_hero", 38, 42], ["c_crab", 22, 26]];
for (const [id, h, h2] of items) {
  const cut = removeBackground(await decode(await readFile(`${dir}/${id}.raw.jpg`)));
  const region = id === "c_hero" ? splitColumns(cut, 3)[0] : undefined;
  const v = {
    a_full: makeSprite(cut, palette, { region, height: h, maxColors: 18, focus: 1 }),
    b_focus: makeSprite(cut, palette, { region, height: h, maxColors: 18, focus: 0.5 }),
    c_noink: makeSprite(cut, palette, { region, height: h, maxColors: 18, focus: 0.5, outline: false }),
    d_big: makeSprite(cut, palette, { region, height: h2, maxColors: 20, focus: 0.5 }),
    e_bignoink: makeSprite(cut, palette, { region, height: h2, maxColors: 20, focus: 0.5, outline: false }),
  };
  for (const [k, ix] of Object.entries(v)) await writeFile(`${out}/${id}.${k}.png`, await encodePng(indexedToImg(ix, palette)));
}
