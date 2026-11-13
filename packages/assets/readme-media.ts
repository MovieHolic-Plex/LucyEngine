// README 에 쓰는 그림을 만든다: 배너(SVG)와 스크린샷(JPEG).
//   cd packages/assets && pnpm exec tsx readme-media.ts
// 스크린샷 원본은 tmp/ 에 있어야 한다 (scripts/shot.mjs 로 찍는다).
import sharp from "sharp";
import { existsSync, writeFileSync } from "node:fs";

const OUT = "../../docs/media/";
const KIT = "../server/starter/";

// ── 배너 ──
async function sprite(file: string, frame?: { w: number; h: number }): Promise<{ uri: string; w: number; h: number }> {
  let img = sharp(KIT + file);
  const meta = await img.metadata();
  let w = meta.width!, h = meta.height!;
  if (frame) {
    img = img.extract({ left: 0, top: 0, width: frame.w, height: frame.h });
    w = frame.w;
    h = frame.h;
  }
  return { uri: `data:image/png;base64,${(await img.png().toBuffer()).toString("base64")}`, w, h };
}

const K = 3, GROUND = 318;
const cast: Array<{ s: Awaited<ReturnType<typeof sprite>>; x: number }> = [
  { s: await sprite("tree.png"), x: 730 },
  { s: await sprite("bench.png"), x: 842 },
  { s: await sprite("lamp.png"), x: 925 },
  { s: await sprite("vending.png"), x: 1000 },
  { s: await sprite("oldman.png", { w: 25, h: 40 }), x: 1075 },
  { s: await sprite("hero.png", { w: 28, h: 40 }), x: 1140 },
  { s: await sprite("slime.png", { w: 29, h: 24 }), x: 1215 },
  { s: await sprite("barrel.png"), x: 625 },
];
const sprites = cast.map(({ s, x }) => `<image href="${s.uri}" x="${x - (s.w * K) / 2}" y="${GROUND - s.h * K}" width="${s.w * K}" height="${s.h * K}" style="image-rendering:pixelated" image-rendering="pixelated"/>`).join("\n  ");
// 바닥: 작은 정사각형을 흩뿌려 화소 느낌을 낸다
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const specks = Array.from({ length: 150 }, () => {
  const x = Math.floor(rnd() * 160) * 8, y = GROUND + Math.floor(rnd() * 5) * 8, a = 0.05 + rnd() * 0.12;
  return `<rect x="${x}" y="${y}" width="8" height="8" fill="#fff" opacity="${a.toFixed(2)}"/>`;
}).join("");
const stars = Array.from({ length: 60 }, () => `<rect x="${Math.floor(rnd() * 320) * 4}" y="${Math.floor(rnd() * 50) * 4}" width="4" height="4" fill="#fff" opacity="${(0.08 + rnd() * 0.35).toFixed(2)}"/>`).join("");

const banner = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1280 360" width="1280" height="360" role="img" aria-label="LucyEngine — describe a scene, play it">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0a18"/><stop offset="0.7" stop-color="#1d1638"/><stop offset="1" stop-color="#3a2346"/></linearGradient>
    <linearGradient id="word" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd98a"/><stop offset="0.55" stop-color="#ff9a6b"/><stop offset="1" stop-color="#ff6fa3"/></linearGradient>
    <radialGradient id="lamp" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffb46a" stop-opacity="0.55"/><stop offset="0.5" stop-color="#ff8a4a" stop-opacity="0.16"/><stop offset="1" stop-color="#ff8a4a" stop-opacity="0"/></radialGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2238"/><stop offset="1" stop-color="#15101f"/></linearGradient>
    <clipPath id="round"><rect width="1280" height="360" rx="28"/></clipPath>
  </defs>
  <g clip-path="url(#round)">
    <rect width="1280" height="360" fill="url(#sky)"/>
    ${stars}
    <rect y="${GROUND}" width="1280" height="${360 - GROUND}" fill="url(#ground)"/>
    ${specks}
    <ellipse cx="925" cy="170" rx="330" ry="240" fill="url(#lamp)"/>
    ${sprites}
    <ellipse cx="925" cy="150" rx="110" ry="100" fill="url(#lamp)"/>
    <g font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,'Helvetica Neue',Arial,sans-serif">
      <text x="72" y="150" font-size="92" font-weight="800" letter-spacing="-4" fill="url(#word)">LucyEngine</text>
      <text x="76" y="204" font-size="30" font-weight="600" letter-spacing="-0.6" fill="#f4f1ff">Describe a scene. Play it.</text>
      <text x="76" y="244" font-size="19" font-weight="400" fill="#b9b3d1">An AI-native editor for top-down pixel-art adventures</text>
    </g>
  </g>
</svg>`;
writeFileSync(OUT + "banner.svg", banner);

// ── 스크린샷 ──
const shots: Array<[from: string, to: string]> = [
  ["gen2-done.png", "scene-forest.jpg"],
  ["gen2-play.png", "play-forest.jpg"],
  ["gen3-done.png", "scene-desert.jpg"],
  ["gen1-done.png", "scene-station.jpg"],
  ["talk.png", "play-dialogue.jpg"],
  ["r-inspector.png", "inspector.jpg"],
  ["brush.png", "brush.jpg"],
  ["r-scene.png", "mood.jpg"],
  ["r-palette.png", "palette.jpg"],
  ["scene-light.png", "light-theme.jpg"],
];
for (const [from, to] of shots) {
  if (!existsSync("../../tmp/" + from)) {
    console.log("missing", from);
    continue;
  }
  await sharp("../../tmp/" + from).resize({ width: 1280 }).jpeg({ quality: 84, mozjpeg: true }).toFile(OUT + to);
}
console.log("done");
