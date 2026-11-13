// 언어 모델에게 그리기 코드를 쓰게 해서 예시 장면의 그림을 만든다. 사람도 그림 되먹임도 없이 한 번에 그린다.
//
//   pnpm exec tsx scripts/draw-llm.ts --model claude-fable-5-2 --effort medium [--only hero,tree] [--out spike/out/llm-x]
//
// 모델이 받는 것은 손으로 그릴 때 쓰는 것과 같은 도구(packages/assets/src/hand/kit.ts)와 같은 주문서(specs.ts)다.
// 코드가 오류를 내거나 크기가 틀리면 오류 글만 돌려주고 두 번까지 고치게 한다.
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "@age/assets";
import * as kitModule from "../packages/assets/src/hand/kit";
import * as terrain from "../packages/assets/src/hand/terrain";
import { SPECS, type Spec } from "../packages/assets/src/hand/specs";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const model = arg("model", "claude-fable-5-2")!;
const effort = arg("effort", "medium")!;
const only = arg("only")?.split(",");
const outDir = arg("out", join("spike", "out", `llm-${model}-${effort}`))!;
mkdirSync(outDir, { recursive: true });

const kit = { ...kitModule, Tex: terrain.Tex, wrapNoise: terrain.wrapNoise, scatter: terrain.scatter, TEX: terrain.TEX };

const SYSTEM = `You are a pixel artist. You draw sprites for a top-down adventure game by writing JavaScript that places pixels with a small drawing kit. Your code is run once and its result goes straight into the game: nobody edits it and you will not see the picture, so reason carefully about coordinates and shapes before you write, the way an artist plans on grid paper.

# The look

The game aims for the feel of Eastward: warm, hand-made pixel art of a lived-in, slightly run-down world, seen from a three-quarter top-down view (the camera looks down at an angle, so you see the front face of things and a little of their top). One tile is 24 pixels; a person is about 1.4 tiles tall.

What makes pixel art at this size read well:
- Clear silhouettes. Decide the outer shape first; it should be recognisable as a flat black shape.
- Light comes from the upper left. Top and left faces are lighter, right and bottom faces darker. Use two or three tones per material, placed as deliberate clusters and bands, never as scattered single-pixel noise.
- Hue shifts with value: the palette ramps already bend toward violet in the shadows and toward yellow in the lights, so shading by moving along a ramp looks rich. Shadows may borrow a cooler neighbouring family and highlights a warmer one.
- A few specific details sell an object (a dent, a nail, a patch of rust, a lit window). Prefer a handful of meaningful details to uniform texture.
- Outlines are selective: after drawing the filled shapes, call canvas.outline() once; it surrounds the sprite with a darker tone of whatever colour it touches. Do not draw your own black border. Interior lines that separate parts should be a dark tone of the local colour.
- Things sit on the ground: the lowest pixels of a sprite are where it touches the floor, centred horizontally. Do not draw a cast shadow or ground; the game adds shadows and lighting.

# The kit

Your code receives one argument, \`kit\`:

col(family, tone) → colour string. family is one of: "rust" (red-brown), "orange", "gold", "leaf" (yellow-green), "green", "teal", "blue", "violet", "rose", "skin", "wood", "stone" (warm grey), "steel" (cool grey), and muted versions "rustM", "goldM", "leafM", "greenM", "tealM", "blueM", "violetM", "roseM". tone is 0 (darkest, lightness about 20%) to 6 (lightest, about 90%); 3 is the mid tone. Only these colours exist.
ink → near-black, paper → warm white.
shade(colour, steps) → the same family, darker by that many tones.
rng(seed) → a function returning deterministic random numbers in [0,1). Never use Math.random.

new Canvas(w, h) — transparent canvas; (0,0) is the top-left pixel. Methods (all chainable unless noted):
  set(x, y, colour|null), get(x, y) → colour|null
  over(x, y, colour) — paints only where something is already painted (keeps texture inside a shape)
  rect(x, y, w, h, colour), hline(x0, x1, y, colour), vline(x, y0, y1, colour), line(x0, y0, x1, y1, colour)
  ellipse(cx, cy, rx, ry, colourOrFn) — filled; fractional centre/radius are allowed (cx = 9.5, rx = 9.5 gives a 20-wide ellipse). If a function (x, y, nx, ny) → colour|null is given, nx and ny run from -1 to 1 across the ellipse, which is handy for shading a ball.
  rows(y, [[x0, x1], [x0, x1], ...], colourOrFn) — fills one horizontal span per row starting at y; the quickest way to build an exact silhouette row by row.
  stamp(x, y, ["..ab..", ...], {a: colour, b: colour}) — pastes ASCII art; '.' and space are transparent. Every row must have the same length or it throws.
  blit(otherCanvas, dx, dy, flipHorizontally?)
  outline(steps = 3) — the selective outline described above. Leave at least one transparent pixel of margin on every side for it.
  bounds() → {x, y, w, h}, trim() → a new canvas cropped to the painted area
strip([frames]) → frames side by side; stack([rows]) → rows on top of each other.

For ground textures only:
  TEX = 144; new Tex() is a 144×144 Canvas with wset(x, y, colour) and wget(x, y) that wrap around the edges, and fill((x, y) => colour).
  wrapNoise(cells, seed) → (x, y) => 0..1, smooth noise that tiles seamlessly over 144 px (cells = number of blobs per side).
  scatter(step, seed, keep) → array of {x, y, r} jittered positions covering the texture, about one per step×step cell, each kept with probability keep; r is a random number for variation.

# What to return

Reply with one JavaScript code block containing a function \`draw(kit)\` and nothing else. It must return:
- prop or building: a Canvas. The object stands on the bottom row, centred horizontally. Stay close to the requested size.
- terrain: a Tex (144×144), every pixel painted, seamless. Large areas should stay calm and low in contrast, with variation coming from soft patches and small sparse marks, because the texture repeats.
- character or creature: a sprite sheet Canvas, 5 frames wide and 3 rows tall, each frame exactly the requested frame size. Rows from top: facing down (toward the camera), facing up (away from the camera), facing right. Columns: standing, then a four-frame walk cycle (left foot forward, passing, right foot forward, passing). In every frame the feet rest on the bottom row and the body is centred horizontally. Build it with a function that draws one frame from (direction, pose) so that all frames share the same proportions, then strip() and stack() them. People are chibi: a large head (about 14 px wide) on a short body, about 30 px tall in a 24×36 frame. Call outline() on each frame.

Plain JavaScript only (no TypeScript, no imports, no DOM).`;

function userPrompt(s: Spec): string {
  const size = s.kind === "terrain" ? "144×144 texture" : s.kind === "character" || s.kind === "creature" ? `frame size ${s.w}×${s.h} (sheet ${s.w * 5}×${s.h * 3})` : `about ${s.w}×${s.h} pixels`;
  return `Draw: ${s.desc}.\nKind: ${s.kind}. Size: ${size}.\nSetting: a small run-down railway-station town at dusk, overgrown, patched together from wood, tin and old machines.`;
}

function run(code: string): kitModule.Canvas {
  const fn = new Function("kit", `${code}\nreturn draw(kit);`);
  return fn(kit) as kitModule.Canvas;
}

function check(s: Spec, c: kitModule.Canvas): string | null {
  if (!c || typeof c.w !== "number" || !Array.isArray(c.px)) return "draw(kit) must return a Canvas";
  const painted = c.px.filter(Boolean).length;
  if (painted === 0) return "the canvas is empty";
  if (s.kind === "terrain") {
    if (c.w !== 144 || c.h !== 144) return `terrain must be 144×144, got ${c.w}×${c.h}`;
    if (painted !== 144 * 144) return `terrain must paint every pixel; ${144 * 144 - painted} are transparent`;
  } else if (s.kind === "character" || s.kind === "creature") {
    if (c.w !== s.w * 5 || c.h !== s.h * 3) return `the sheet must be ${s.w * 5}×${s.h * 3} (5 frames of ${s.w}×${s.h} in 3 rows), got ${c.w}×${c.h}`;
  } else if (c.w > s.w * 1.6 || c.h > s.h * 1.6 || c.w < s.w * 0.5 || c.h < s.h * 0.5) return `the sprite should be about ${s.w}×${s.h}, got ${c.w}×${c.h}`;
  return null;
}

const client = new Anthropic();
type Row = { id: string; ok: boolean; seconds: number; attempts: number; out: number; error?: string };

async function one(s: Spec): Promise<Row> {
  const started = Date.now();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt(s) }];
  let out = 0, error = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const msg = await client.messages
      .stream({ model, max_tokens: 32000, system: SYSTEM, messages, thinking: { type: "adaptive" }, output_config: { effort }, cache_control: { type: "ephemeral" } } as never)
      .finalMessage();
    out += msg.usage.output_tokens;
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const code = text.match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/)?.[1] ?? text;
    writeFileSync(join(outDir, `${s.id}.js`), code);
    try {
      let c = run(code);
      error = check(s, c) ?? "";
      if (!error) {
        if (s.kind === "prop" || s.kind === "building") c = c.trim();
        writeFileSync(join(outDir, `${s.id}.png`), await encodePng(c.toImg()));
        return { id: s.id, ok: true, seconds: Math.round((Date.now() - started) / 1000), attempts: attempt, out };
      }
    } catch (e) {
      error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    messages.push({ role: "assistant", content: msg.content }, { role: "user", content: `Running that code failed: ${error}\nFix it and reply with the complete corrected code block.` });
  }
  return { id: s.id, ok: false, seconds: Math.round((Date.now() - started) / 1000), attempts: 3, out, error };
}

const todo = SPECS.filter((s) => !only || only.includes(s.id));
const rows: Row[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < todo.length) {
      const s = todo[next++];
      const r = await one(s).catch((e): Row => ({ id: s.id, ok: false, seconds: 0, attempts: 0, out: 0, error: String(e) }));
      rows.push(r);
      console.log(`${r.ok ? "ok  " : "FAIL"} ${r.id.padEnd(9)} ${String(r.seconds).padStart(4)}s  ${r.attempts} attempt(s)  ${r.out} tokens ${r.error ?? ""}`);
    }
  }),
);
writeFileSync(join(outDir, "usage.json"), JSON.stringify({ model, effort, rows }, null, 2));
console.log(`${rows.filter((r) => r.ok).length}/${rows.length} drawn → ${outDir}; ${rows.reduce((n, r) => n + r.out, 0)} output tokens, longest ${Math.max(...rows.map((r) => r.seconds))}s`);
