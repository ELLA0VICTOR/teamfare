import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/agent",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results/agent",
  workers: 1,
  timeout: 45000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5180",
    browserName: "chromium",
    channel: process.env.TEAMFARE_BROWSER_CHANNEL,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/agent/server.ts",
      url: "http://127.0.0.1:3004/api/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:web -- --host 127.0.0.1 --port 5180 --strictPort",
      url: "http://127.0.0.1:5180",
      env: { API_PROXY_TARGET: "http://127.0.0.1:3004" },
      reuseExistingServer: false,
    },
  ],
});
