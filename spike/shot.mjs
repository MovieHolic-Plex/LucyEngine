// 주소를 열어 window.__ready 를 기다린 뒤 화면을 찍는다.
import { chromium } from "@playwright/test";

const [url, out, w = "1280", h = "720"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
try {
  await page.waitForFunction("window.__ready === true", null, { timeout: 30000 });
} catch {
  logs.push("timeout waiting for __ready");
}
await page.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes("Phaser v")).slice(0, 20).join("\n"));
console.log("bakeMs", await page.evaluate("window.__bakeMs"));
await browser.close();
