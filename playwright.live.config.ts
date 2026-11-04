import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/live",
  outputDir: "./test-results/live",
  workers: 1,
  timeout: 45000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5178",
    browserName: "chromium",
    channel: process.env.TEAMFARE_BROWSER_CHANNEL,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node server/index.ts",
      url: "http://127.0.0.1:3002/api/health",
      env: {
        PORT: "3002",
        APP_ORIGIN: "http://127.0.0.1:5178",
        DATABASE_PATH: "./.artifacts/live-test.sqlite",
      },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:web -- --host 127.0.0.1 --port 5178 --strictPort",
      url: "http://127.0.0.1:5178",
      env: { API_PROXY_TARGET: "http://127.0.0.1:3002" },
      reuseExistingServer: false,
    },
  ],
});
