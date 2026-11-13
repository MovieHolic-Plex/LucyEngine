import { indexPalette, type Style, type PaletteIndex } from "@age/model";
import { type Img, decode, encodePng, opaqueBounds } from "./image";
import { type Indexed, removeBackground, makeSprite, downscaleToPalette, limitColors, makeTileable, removeOrphans, splitColumns, indexedToImg, countColors } from "./pixelize";
import { buildCharacterSheet } from "./charsheet";
import type { ImageProvider } from "./provider";

export type GenKind = "terrain" | "prop" | "building" | "character" | "creature";

export interface GenRequest {
  kind: GenKind;
  /** 무엇을 그릴지 (영어). */
  description: string;
  /** 결과 높이 (화소). terrain 과 character 는 정해진 크기를 쓴다. */
  height?: number;
  style: Style;
  signal?: AbortSignal;
}

export interface GenResult {
  png: Buffer;
  w: number;
  h: number;
  /** character·creature 의 프레임 배치. */
  frames?: { frameW: number; frameH: number; perRow: number; rows: Array<"down" | "up" | "side"> };
  /** 대표색. */
  color: string;
  footprint?: { w: number; h: number };
  /** 모델을 부른 횟수. */
  attempts: number;
  prompt: string;
}

export class GenerationError extends Error {
  constructor(message: string, readonly reasons: string[]) {
    super(message);
    this.name = "GenerationError";
  }
}

const STYLE =
  "Pixel art game asset in a modern indie 16-bit JRPG style: chunky clean pixels, limited colour palette, dark coloured outlines (never pure black lines), hue-shifted shading with warm highlights and cool blue-violet shadows, light coming from the upper left. ";
const VIEW =
  "Camera: classic top-down JRPG view. The object is drawn straight-on from the front and slightly from above: its front face is flat and fully visible, a foreshortened top face shows above it, horizontal edges are perfectly horizontal, and the silhouette is left-right symmetric. Do NOT rotate the object, do NOT draw it at an isometric or diagonal angle, no visible left or right side faces. ";
const BG = "One single object, centred, filling most of the frame, on a perfectly flat solid magenta (#FF00FF) background. No cast shadow, no ground, no floor, no text, no border, no gradient, no other objects.";

export const HUMAN_HEIGHT = 38;
export const TERRAIN_SIZE = 72;

function cap(s: string): string {
  const t = s.trim().replace(/[.\s]+$/, "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function buildPrompt(req: GenRequest): string {
  const setting = req.style.mood ? `Setting: ${req.style.mood.trim().replace(/[.\s]+$/, "")}. ` : "";
  const d = req.description.trim().replace(/[.\s]+$/, "");
  switch (req.kind) {
    case "terrain":
      return `${STYLE}A seamless tileable top-down ground texture of ${d}. Viewed straight from above, completely flat, evenly lit, uniform detail across the whole image, low contrast, filling the entire image edge to edge. No objects, no shadows, no perspective, no border, no text. ${setting}`;
    case "character":
      return `${STYLE}${VIEW}Character turnaround sheet of ${d}. Exactly three full-body views of the same character standing in a neutral pose, arranged in one horizontal row with clear empty space between them: left = seen from the front, middle = seen from the side facing right, right = seen from the back. Chibi proportions (large head, short body, about 2.5 heads tall). Identical outfit, colours and size in all three views. Perfectly flat solid magenta (#FF00FF) background. No cast shadow, no ground, no text, no labels, no border. ${setting}`;
    case "creature":
      return `${STYLE}${VIEW}A single full-body view of ${d}, facing the camera. ${BG} ${setting}`;
    case "building":
      return `${STYLE}${VIEW}${cap(d)}. The front wall faces the camera with the door at the bottom centre; the roof rises above and behind it. ${BG} ${setting}`;
    default:
      return `${STYLE}${VIEW}${cap(d)}. ${BG} ${setting}`;
  }
}

function dominantColor(ix: Indexed, palette: PaletteIndex): string {
  const counts = new Map<number, number>();
  for (const c of ix.idx) if (c > 0) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = 1, n = -1;
  for (const [c, k] of counts) if (k > n) { n = k; best = c; }
  return palette.colors[best] ?? "#888888";
}

/** 맨 아래쪽 줄들에서 불투명 화소가 차지하는 폭 (바닥에 닿는 부분). */
function baseWidth(ix: Indexed): number {
  const rows = Math.max(2, Math.round(ix.h * 0.14));
  let x0 = ix.w, x1 = -1;
  for (let y = ix.h - rows; y < ix.h; y++)
    for (let x = 0; x < ix.w; x++)
      if (ix.idx[y * ix.w + x] >= 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
  return x1 < 0 ? ix.w : x1 - x0 + 1;
}

function opaqueFraction(img: Img): number {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] >= 128) n++;
  return n / (img.w * img.h);
}

interface Processed {
  ix: Indexed;
  frames?: GenResult["frames"];
  footprint?: { w: number; h: number };
  problems: string[];
}

/** 받은 그림을 게임 에셋으로 만들고 문제를 찾는다. */
export function processRaw(kind: GenKind, raw: Img, palette: PaletteIndex, height: number): Processed {
  const problems: string[] = [];
  if (kind === "terrain") {
    const size = TERRAIN_SIZE, band = 10;
    const m = Math.round(raw.w * 0.06);
    let ix = downscaleToPalette(raw, size + band, size + band, palette, { region: { x: m, y: m, w: raw.w - 2 * m, h: raw.h - 2 * m }, calm: 0.3, flatten: 0.8 });
    ix = limitColors(ix, palette, 7);
    ix = removeOrphans(makeTileable(ix, size, band));
    if (countColors(ix) < 2) problems.push("the texture came out as a single flat colour");
    return { ix, problems };
  }

  const cut = removeBackground(raw);
  const frac = opaqueFraction(cut);
  if (frac < 0.02) problems.push("the image was empty after removing the background");
  if (frac > 0.9) problems.push("the background could not be removed (it was not a flat colour)");
  const box = opaqueBounds(cut);
  if (box && kind !== "character") {
    const touching = [box.x <= 1, box.y <= 1, box.x + box.w >= raw.w - 1, box.y + box.h >= raw.h - 1].filter(Boolean).length;
    if (touching >= 3) problems.push("the subject is cut off by the image edges");
  }
  if (problems.length) return { ix: { w: 1, h: 1, idx: new Int16Array([-1]) }, problems };

  if (kind === "character") {
    const boxes = splitColumns(cut, 3);
    if (boxes.length < 3) problems.push(`expected three views of the character but found ${boxes.length}`);
    else {
      const hs = boxes.map((b) => b.h);
      if (Math.min(...hs) / Math.max(...hs) < 0.7) problems.push("the three views of the character are very different in size");
      const ws = boxes.map((b) => b.w);
      if (Math.max(...ws) > Math.max(...hs) * 1.25) problems.push("a view of the character is wider than it is tall (views probably merged)");
    }
    if (problems.length) return { ix: { w: 1, h: 1, idx: new Int16Array([-1]) }, problems };
    const maxH = Math.max(...boxes.map((b) => b.h));
    const [front, side, back] = boxes.map((b) => makeSprite(cut, palette, { region: b, height: Math.max(8, Math.round((height * b.h) / maxH)), maxColors: 18 }));
    const s = buildCharacterSheet({ front, side, back }, "humanoid");
    return { ix: s.sheet, frames: { frameW: s.frameW, frameH: s.frameH, perRow: s.framesPerRow, rows: s.rows }, problems };
  }

  if (kind === "creature") {
    const front = makeSprite(cut, palette, { height, maxColors: 18 });
    const s = buildCharacterSheet({ front }, "creature");
    return { ix: s.sheet, frames: { frameW: s.frameW, frameH: s.frameH, perRow: s.framesPerRow, rows: s.rows }, problems };
  }

  const ix = makeSprite(cut, palette, { height, maxColors: kind === "building" ? 28 : 18 });
  if (ix.w > ix.h * 4 || ix.h > ix.w * 6) problems.push("the sprite has an extreme aspect ratio");
  const base = baseWidth(ix);
  const footprint = kind === "building"
    ? { w: Math.max(8, Math.round(base * 0.94)), h: Math.max(8, Math.round(ix.h * 0.38)) }
    : { w: Math.max(6, Math.round(base * 0.88)), h: Math.max(6, Math.min(Math.round(ix.h * 0.3), Math.round(base * 0.5))) };
  return { ix, footprint, problems };
}

export const DEFAULT_HEIGHT: Record<GenKind, number> = { terrain: TERRAIN_SIZE, prop: 28, building: 120, character: HUMAN_HEIGHT, creature: 22 };

/**
 * 에셋 하나를 생성한다: 요청 글 → 이미지 모델 → 후처리 → 검사.
 * 검사에 걸리면 두 번까지 다시 그린다. 끝내 실패하면 GenerationError 를 던진다.
 */
export async function generateAsset(provider: ImageProvider, req: GenRequest, opts: { retries?: number } = {}): Promise<GenResult> {
  const palette = indexPalette(req.style.palette);
  const prompt = buildPrompt(req);
  const height = req.kind === "character" ? HUMAN_HEIGHT : Math.max(8, Math.min(200, Math.round(req.height ?? DEFAULT_HEIGHT[req.kind])));
  const retries = opts.retries ?? 2;
  const reasons: string[] = [];
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    if (req.signal?.aborted) throw new Error("aborted");
    let raw: Img;
    try {
      const bytes = await provider.generate({ prompt, aspect: req.kind === "character" ? "3:2" : "1:1", signal: req.signal });
      raw = await decode(bytes);
    } catch (e) {
      if (req.signal?.aborted) throw e;
      reasons.push(`attempt ${attempt}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const done = processRaw(req.kind, raw, palette, height);
    if (done.problems.length) {
      reasons.push(`attempt ${attempt}: ${done.problems.join("; ")}`);
      continue;
    }
    const png = await encodePng(indexedToImg(done.ix, palette));
    return { png, w: done.ix.w, h: done.ix.h, frames: done.frames, color: dominantColor(done.ix, palette), footprint: done.footprint, attempts: attempt, prompt };
  }
  throw new GenerationError(`could not generate "${req.description}"`, reasons);
}
