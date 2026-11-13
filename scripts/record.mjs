// README 용 짧은 영상을 찍는다: 대상 고르기 → 플레이 → 대화 → 전투.
//   node scripts/record.mjs <projectUrl> <outDir>
import { chromium } from "@playwright/test";

const [url, outDir = "tmp/video"] = process.argv.slice(2);
const size = { width: 1280, height: 760 };
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: size, colorScheme: "dark", recordVideo: { dir: outDir, size } });
const page = await ctx.newPage();
await page.goto(url);
await page.waitForFunction("!!window.__view && !!window.__store.getState().doc");
await page.evaluate("window.__view.settle()");
const t0 = Date.now();
const mark = (name) => console.log(name, ((Date.now() - t0) / 1000).toFixed(1));
await page.waitForTimeout(1200);
// 인물을 고르면 인스펙터가 뜬다
const b = await page.evaluate(() => window.__view.entityBounds("keeper"));
await page.mouse.move(b.x + b.w / 2, b.y + b.h * 0.6, { steps: 8 });
await page.mouse.click(b.x + b.w / 2, b.y + b.h * 0.6);
await page.waitForTimeout(2200);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
mark("play");
await page.keyboard.press("Control+Enter");
await page.waitForTimeout(1300);
const pos = () => page.evaluate(() => { const a = window.__view.world.actors.find((a) => a.id === "player"); return { x: a.x / 24, y: a.y / 24 }; });
const walk = async (key, done) => { await page.keyboard.down(key); for (let i = 0; i < 300 && !done(await pos()); i++) await page.waitForTimeout(30); await page.keyboard.up(key); };
await walk("d", (p) => p.x > 21.4);
await walk("w", (p) => p.y < 9.0);
await page.waitForTimeout(300);
mark("talk");
await page.keyboard.press("e");
await page.waitForTimeout(2600);
await page.keyboard.press("e");
await page.waitForTimeout(2400);
await page.keyboard.press("e");
await page.waitForTimeout(2200);
await page.keyboard.press("e");
await page.waitForTimeout(600);
// 게에게 가서 싸운다
mark("fight");
await walk("s", (p) => p.y > 11.2);
await page.keyboard.down("d");
for (let i = 0; i < 14; i++) { await page.waitForTimeout(220); await page.keyboard.press("j"); }
await page.keyboard.up("d");
await page.waitForTimeout(800);
mark("end");
await ctx.close();
console.log(await page.video().path());
await browser.close();
