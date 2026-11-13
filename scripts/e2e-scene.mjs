// 한 문장으로 장면을 만드는 전체 흐름을 실제 브라우저에서 돌려 보고 시간을 잰다.
//   node scripts/e2e-scene.mjs "<요청>" <출력 접두어>
import { chromium } from "@playwright/test";

const [text, prefix = "tmp/scene"] = process.argv.slice(2);
const base = process.env.EDITOR_URL ?? "http://localhost:5173";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.clear());
await page.goto(base);
await page.waitForURL(/\/p\//);
await page.waitForFunction("!!window.__view");
console.log("project", page.url());
await page.fill("#composer", text);
await page.keyboard.press("Enter");
const started = Date.now();
const sec = () => Math.round((Date.now() - started) / 1000);
let shot = 0, lastStatus = "";
for (;;) {
  await page.waitForTimeout(2000);
  const status = await page.evaluate(() => document.querySelector(".working .label")?.textContent ?? "");
  const busy = await page.evaluate(() => { const a = document.querySelector(".app"); return !a || a.classList.contains("busy"); });
  if (status && status !== lastStatus) console.log(`${sec()}s · ${status}`);
  lastStatus = status;
  if (sec() > 40 * (shot + 1)) await page.screenshot({ path: `${prefix}-progress${++shot}.png` });
  if (!busy) break;
  if (sec() > 900) { console.log("timeout"); break; }
}
console.log(`done in ${sec()}s`);
await page.waitForTimeout(2500);
await page.evaluate("window.__view.settle()");
await page.screenshot({ path: `${prefix}-done.png` });
console.log("reply:", await page.evaluate(() => [...document.querySelectorAll(".msg.assistant")].pop()?.innerText ?? ""));
await page.keyboard.press("Control+Enter");
await page.waitForTimeout(2500);
await page.screenshot({ path: `${prefix}-play.png` });
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
