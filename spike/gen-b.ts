// 방식 (나): 언어 모델이 화소 격자를 직접 쓴다. 팔레트 색을 글자 두 개로 부른다.
import { mkdir, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { buildPalette, indexPalette } from "@age/model";
import { createIndexed, indexedToImg, encodePng, inkOutline } from "@age/assets";

const model = process.argv[2] ?? "claude-opus-5-5";
const out = `spike/out/b-${model}`;
await mkdir(out, { recursive: true });
const client = new Anthropic();
const ramps = buildPalette();
const palette = indexPalette(ramps);
const NAMES = ["rust", "orange", "gold", "leaf", "green", "teal", "blue", "violet", "rose", "skin", "wood", "stone", "steel"];
const LETTERS = "ROGLNTBVPSWCM";
const legend = NAMES.map((n, i) => `${LETTERS[i]}0..${LETTERS[i]}6 = ${n} (0 darkest, 6 lightest): ${ramps[i].join(" ")}`).join("\n");

const items = [
  { id: "p_barrel", w: 22, h: 30, what: "a rusty oil drum barrel, drawn straight-on from the front and slightly above (top ellipse visible)" },
  { id: "c_hero", w: 22, h: 38, what: "a chibi young adventurer girl with short dark hair, red scarf, mustard jacket, standing facing the camera" },
  { id: "p_bush", w: 26, h: 22, what: "a round leafy green bush" },
  { id: "b_house", w: 64, h: 72, what: "a small ramshackle house of wood planks with a slanted corrugated tin roof, door at bottom centre, one window; front wall faces the camera" },
  { id: "t_grass", w: 24, h: 24, what: "a seamless tileable top-down ground texture of overgrown wild grass (every cell filled, low contrast)" },
];

const usage: Record<string, unknown> = {};
async function one(it: (typeof items)[number]) {
  const t0 = Date.now();
  const stream = client.messages.stream({
    model,
    max_tokens: 32000,
    system:
      "You are a pixel artist. You draw sprites as character grids. Each pixel is exactly two characters: a ramp letter and a shade digit (for example W3), or '..' for a transparent pixel, or 'KK' for near-black ink. Light comes from the upper left. Use hue-shifted shading, a darker rim on the silhouette, and clustered pixels (no single-pixel noise). Fill the silhouette well; the subject should use most of the canvas.\n\nPalette:\n" + legend,
    messages: [{ role: "user", content: `Draw ${it.what} for a top-down 16-bit style RPG.\nCanvas: exactly ${it.w} pixels wide and ${it.h} pixels tall.\nReply with only the grid: ${it.h} lines, each with exactly ${it.w} two-character pixels and no spaces.` }],
  });
  const msg = await stream.finalMessage();
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => /^([A-Z][0-6]|\.\.|KK)+$/.test(l));
  const ix = createIndexed(it.w, it.h);
  let bad = 0;
  for (let y = 0; y < Math.min(it.h, lines.length); y++)
    for (let x = 0; x < it.w; x++) {
      const tok = lines[y].slice(x * 2, x * 2 + 2);
      if (!tok || tok === "..") continue;
      if (tok === "KK") { ix.idx[y * it.w + x] = 0; continue; }
      const ri = LETTERS.indexOf(tok[0]), ci = Number(tok[1]);
      if (ri < 0 || !(ci >= 0 && ci <= 6)) { bad++; continue; }
      ix.idx[y * it.w + x] = 1 + ri * 7 + ci;
    }
  await writeFile(`${out}/${it.id}.png`, await encodePng(indexedToImg(ix, palette)));
  await writeFile(`${out}/${it.id}.txt`, text);
  usage[it.id] = { ms: Date.now() - t0, lines: lines.length, wantLines: it.h, widths: [...new Set(lines.map((l) => l.length / 2))], bad, in: msg.usage.input_tokens, out: msg.usage.output_tokens };
  console.log(it.id, JSON.stringify(usage[it.id]));
}
await Promise.all(items.map((it) => one(it).catch((e) => console.log("FAIL", it.id, String(e).slice(0, 300)))));
await writeFile(`${out}/usage.json`, JSON.stringify(usage, null, 1));
