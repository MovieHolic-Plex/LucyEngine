// 절차적 걷기 프레임 확인: r4 의 주인공·NPC·슬라임으로 시트를 만든다.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildPalette, indexPalette } from "@age/model";
import { decode, encodePng, removeBackground, makeSprite, indexedToImg, splitColumns, buildCharacterSheet } from "@age/assets";

const palette = indexPalette(buildPalette());
const out = "spike/out/walk";
await mkdir(out, { recursive: true });
for (const [id, kind] of [["c_hero", "humanoid"], ["c_npc", "humanoid"], ["c_slime", "creature"], ["c_crab", "creature"]] as const) {
  const cut = removeBackground(await decode(await readFile(`spike/out/a-r4/${id}.raw.jpg`)));
  if (kind === "humanoid") {
    const boxes = splitColumns(cut, 3);
    const maxH = Math.max(...boxes.map((b) => b.h));
    const [front, side, back] = boxes.map((b) => makeSprite(cut, palette, { region: b, height: Math.round((38 * b.h) / maxH), maxColors: 18 }));
    const s = buildCharacterSheet({ front, side, back }, "humanoid");
    await writeFile(`${out}/proc_${id}.png`, await encodePng(indexedToImg(s.sheet, palette)));
    console.log(id, s.frameW, s.frameH);
  } else {
    const front = makeSprite(cut, palette, { height: 22, maxColors: 18 });
    const s = buildCharacterSheet({ front }, "creature");
    await writeFile(`${out}/proc_${id}.png`, await encodePng(indexedToImg(s.sheet, palette)));
    console.log(id, s.frameW, s.frameH);
  }
}
