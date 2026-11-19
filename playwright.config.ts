import { defineConfig } from "@playwright/test";
import { E2E_BASE_URL, E2E_ENV } from "./tests/e2e/env";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: ".test-results/playwright.json" }]],
  use: { baseURL: E2E_BASE_URL, screenshot: "off", trace: "off", launchOptions: { args: ["--no-sandbox"], ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) } },
  webServer: {
    // Server produksi (hasil `npm run build`) terhadap database E2E.
    command: "npx tsx tests/e2e/prepare-db.ts && npx next start -p 3100",
    url: `${E2E_BASE_URL}/api/health`,
    timeout: 90_000,
    reuseExistingServer: false,
    env: { ...E2E_ENV, NODE_ENV: "production" } as Record<string, string>,
  },
});
