// 방식 (가): 이미지 모델 + 후처리. 한 장면 분량을 뽑아 원본과 결과를 spike/out/a 에 둔다.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { buildPalette, indexPalette } from "@age/model";
import { providerFromEnv, decode, encodePng, removeBackground, makeSprite, indexedToImg, downscaleToPalette, limitColors, makeTileable, splitColumns, removeOrphans } from "@age/assets";

const run = process.argv[2] ?? "r1";
const only = process.argv[3];
const variant = process.argv[4] ?? "v2"; // v1 = 처음 프롬프트, v2 = 정면 시점 강화, ref = v2 + 스타일 기준 그림
const refPath = process.argv[5];
const ref = variant === "ref" && refPath ? await readFile(refPath) : null;
const out = `spike/out/a-${run}`;
await mkdir(out, { recursive: true });
const provider = providerFromEnv()!;
const palette = indexPalette(buildPalette());

const STYLE =
  "Pixel art game asset in a modern indie 16-bit JRPG style: chunky clean pixels, limited colour palette, dark coloured outlines (never pure black lines), hue-shifted shading with warm highlights and cool blue-violet shadows, light coming from the upper left. ";
const VIEW =
  "Seen from a fixed three-quarter top-down RPG camera (looking down at about 45 degrees): the front face is fully visible and the top face is foreshortened. Not isometric, not rotated, not side-on. ";
const VIEW2 =
  "Camera: classic top-down JRPG view. The object is drawn straight-on from the front and slightly from above: its front face is flat and fully visible, a foreshortened top face shows above it, horizontal edges are perfectly horizontal, and the silhouette is left-right symmetric. Do NOT rotate the object, do NOT draw it at an isometric or diagonal angle, no visible left or right side faces. ";
const REF = "Match the pixel art style of the attached reference image exactly: same pixel size, same outline treatment, same shading and colour mood. The reference shows the style only; do not copy its subject. ";
const BG = "One single object, centred, filling most of the frame, on a perfectly flat solid magenta (#FF00FF) background. No cast shadow, no ground, no floor, no text, no border, no gradient, no other objects.";
const SETTING = "Setting: a run-down small town built around an abandoned railway station, rusty metal, weathered wood, overgrown plants, warm evening after rain. ";

interface Item { id: string; kind: "prop" | "building" | "terrain" | "character" | "creature"; prompt: string; h?: number; }
const items: Item[] = [
  { id: "t_pavement", kind: "terrain", prompt: "cracked old concrete pavement with small weeds in the cracks" },
  { id: "t_dirt", kind: "terrain", prompt: "packed brown dirt ground with tiny pebbles" },
  { id: "t_grass", kind: "terrain", prompt: "overgrown wild grass with a few tiny clover leaves" },
  { id: "p_barrel", kind: "prop", h: 30, prompt: "a rusty oil drum barrel" },
  { id: "p_crate", kind: "prop", h: 26, prompt: "a weathered wooden shipping crate" },
  { id: "p_lamp", kind: "prop", h: 64, prompt: "an old iron street lamp post with a glowing warm lantern on top" },
  { id: "p_bench", kind: "prop", h: 22, prompt: "a worn wooden station bench facing the viewer" },
  { id: "p_sign", kind: "prop", h: 36, prompt: "a wooden signpost with a blank rusty metal plate" },
  { id: "p_vending", kind: "prop", h: 46, prompt: "an old dented vending machine with faded colours and a faint glow" },
  { id: "p_bush", kind: "prop", h: 22, prompt: "a round leafy green bush" },
  { id: "p_tree", kind: "prop", h: 84, prompt: "a broad leafy tree with a thick trunk" },
  { id: "b_house", kind: "building", h: 128, prompt: "a small ramshackle two-storey house patched together from wood planks and corrugated tin, with a door in the middle of the front wall, a window and a slanted tin roof" },
  { id: "b_shop", kind: "building", h: 110, prompt: "a small ticket booth shop converted from an old train carriage, with an awning, a counter window and a door" },
  { id: "x_kit", kind: "kit" as any, prompt: "" },
  { id: "c_hero", kind: "character", prompt: "a young adventurer girl with short dark hair, a red scarf, a mustard jacket and a big wrench on her back" },
  { id: "c_npc", kind: "character", prompt: "an old shopkeeper man with a white beard, a green apron and a flat cap" },
  { id: "c_slime", kind: "creature", h: 22, prompt: "a small blobby mould slime monster, teal with glowing yellow eyes" },
  { id: "c_crab", kind: "creature", h: 22, prompt: "a small rusty scrap-metal crab robot with one glowing red eye" },
];

function promptFor(it: Item): string {
  if ((it.kind as string) === "kit")
    return `${STYLE}${VIEW2}A modular building kit sprite sheet for assembling ramshackle wood-and-tin houses of any width: a 4 by 3 grid of separate square tiles with clear magenta gaps between them. Row 1: roof left end, roof middle (repeatable), roof middle with chimney, roof right end. Row 2: upper wall left end, upper wall middle (repeatable), upper wall with window, upper wall right end. Row 3: ground wall left end, ground wall middle (repeatable), ground wall with door, ground wall right end. Every tile is the same size and its left and right edges line up with its neighbours so tiles can be placed side by side seamlessly. Perfectly flat solid magenta (#FF00FF) background. No text, no labels. ${SETTING}`;
  if (it.kind === "terrain")
    return `${STYLE}A seamless tileable top-down ground texture of ${it.prompt}. Viewed straight from above, completely flat, evenly lit, uniform detail across the whole image, low contrast, filling the entire image edge to edge. No objects, no shadows, no perspective, no border, no text. ${SETTING}`;
  if (it.kind === "character")
    return `${STYLE}${VIEW}Character turnaround sheet of ${it.prompt}. Exactly three full-body views of the same character standing in a neutral pose, arranged in one horizontal row with clear empty space between them: left = seen from the front, middle = seen from the side facing right, right = seen from the back. Chibi proportions (large head, short body, about 2.5 heads tall). Identical outfit, colours and size in all three views. Perfectly flat solid magenta (#FF00FF) background. No cast shadow, no ground, no text, no labels, no border. ${SETTING}`;
  const view = variant === "v1" ? VIEW : VIEW2;
  const pre = (ref ? REF : "") + STYLE + view;
  if (it.kind === "creature")
    return `${pre}A single full-body view of ${it.prompt}, facing the camera. ${BG} ${SETTING}`;
  if (it.kind === "building")
    return `${pre}${it.prompt[0].toUpperCase()}${it.prompt.slice(1)}. The front wall faces the camera with the door at the bottom centre; the roof rises above and behind it. ${BG} ${SETTING}`;
  return `${pre}${it.prompt[0].toUpperCase()}${it.prompt.slice(1)}. ${BG} ${SETTING}`;
}

const t0 = Date.now();
const timings: Record<string, number> = {};
async function one(it: Item) {
  const rawPath = `${out}/${it.id}.raw.jpg`;
  const s = Date.now();
  let raw: Buffer;
  if (existsSync(rawPath)) raw = await readFile(rawPath);
  else {
    raw = await provider.generate({ prompt: promptFor(it), aspect: it.kind === "character" ? "3:2" : "1:1", refs: ref && it.kind !== "terrain" ? [ref] : undefined });
    await writeFile(rawPath, raw);
  }
  timings[it.id] = Date.now() - s;
  const img = await decode(raw);
  if ((it.kind as string) === "kit") return;
  if (it.kind === "terrain") {
    const size = Number(process.env.TSIZE ?? 72), band = 10;
    const m = Math.round(img.w * 0.06);
    let ix = downscaleToPalette(img, size + band, size + band, palette, { region: { x: m, y: m, w: img.w - 2 * m, h: img.h - 2 * m }, calm: 0.3, flatten: 0.8 });
    ix = limitColors(ix, palette, 7);
    ix = removeOrphans(makeTileable(ix, size, band));
    await writeFile(`${out}/${it.id}.png`, await encodePng(indexedToImg(ix, palette)));
    return;
  }
  const cut = removeBackground(img);
  if (it.kind === "character") {
    const boxes = splitColumns(cut, 3);
    const maxH = Math.max(...boxes.map((b) => b.h));
    const names = ["front", "side", "back"];
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const ix = makeSprite(cut, palette, { region: b, height: Math.round((38 * b.h) / maxH), maxColors: 18 });
      await writeFile(`${out}/${it.id}.${names[i]}.png`, await encodePng(indexedToImg(ix, palette)));
    }
    return;
  }
  const ix = makeSprite(cut, palette, { height: it.h!, maxColors: it.kind === "building" ? 28 : 18 });
  await writeFile(`${out}/${it.id}.png`, await encodePng(indexedToImg(ix, palette)));
}

const todo = items.filter((it) => !only || it.id.startsWith(only));
const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let it = queue.shift(); it; it = queue.shift()) {
    try { await one(it); console.log("ok", it.id, timings[it.id] + "ms"); }
    catch (e) { console.log("FAIL", it.id, String(e).slice(0, 200)); }
  }
}));
console.log("total", Date.now() - t0, "ms for", todo.length);
await writeFile(`${out}/timings.json`, JSON.stringify({ totalMs: Date.now() - t0, timings }, null, 1));
