import { defineConfig } from "@playwright/test";

const baseURL = process.env.EDITOR_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "../test-results",
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    // 헤드리스에서도 WebGL 이 돌게 한다
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    cwd: "..",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
