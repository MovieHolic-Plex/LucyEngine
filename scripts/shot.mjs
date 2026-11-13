// 편집기를 열어 화면을 찍는다. 개발 중 눈으로 확인하는 용도.
//   node scripts/shot.mjs <url> <out.png> [width] [height] [js-to-run-before-shot]
import { chromium } from "@playwright/test";

const [url, out, w = "1440", h = "900", script] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, colorScheme: process.env.SCHEME ?? "dark" });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => r.status() >= 400 && logs.push(`[http ${r.status()}] ${r.url()}`));
await page.goto(url);
await page.waitForFunction("!!window.__view", null, { timeout: 30000 }).catch(() => logs.push("no view"));
await page.evaluate("window.__view?.settle()").catch((e) => logs.push(String(e)));
await page.waitForTimeout(600);
if (script) {
  const fn = new Function("page", "console", `return (async () => { ${script} })()`);
  await fn(page, console).catch((e) => logs.push(`[script] ${e.message}`));
}
await page.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes("Phaser v") && !l.includes("[vite]") && !l.includes("React DevTools")).slice(0, 30).join("\n"));
console.log("url", page.url());
await browser.close();
