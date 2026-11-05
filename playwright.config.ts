import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results/preview",
  testIgnore: ["**/live/**", "**/agent/**"],
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5176",
    browserName: "chromium",
    channel: process.env.TEAMFARE_BROWSER_CHANNEL,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev:web -- --host 127.0.0.1 --port 5176 --strictPort",
    url: "http://127.0.0.1:5176",
    reuseExistingServer: !process.env.CI,
  },
});
