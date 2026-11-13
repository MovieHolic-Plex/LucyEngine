// 걷기 애니메이션을 이미지 모델에 맡겨 본다 (기준 그림 유무 두 가지).
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { providerFromEnv } from "@age/assets";

const out = "spike/out/walk";
await mkdir(out, { recursive: true });
const provider = providerFromEnv()!;
const base =
  "Pixel art game sprite sheet in a modern indie 16-bit JRPG style, chunky clean pixels, dark coloured outlines. A walk cycle of one chibi character seen from the front (walking toward the camera), top-down RPG view. Exactly four frames in one horizontal row with clear empty space between them: 1) left foot forward, 2) feet together, 3) right foot forward, 4) feet together. The character's head, body, outfit, colours, size and position are identical in every frame; only the legs and arms move. Perfectly flat solid magenta (#FF00FF) background. No shadow, no ground, no text.";
const who = "The character: a young adventurer girl with short dark hair, a red scarf, a mustard jacket and a big wrench on her back.";
const ref = await readFile("spike/out/a-r4/c_hero.raw.jpg");

await Promise.all([
  provider.generate({ prompt: `${base} ${who}`, aspect: "16:9" }).then((b) => writeFile(`${out}/text.jpg`, b)),
  provider
    .generate({ prompt: `${base} The character is exactly the one shown in the attached reference sheet (use its front view); keep the design identical.`, refs: [ref], aspect: "16:9" })
    .then((b) => writeFile(`${out}/ref.jpg`, b)),
]);
console.log("done");
