import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const testPort = Number(process.env.TEST_PORT || process.env.PORT || 3010);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${testPort}`;
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const testDocumentStorageDir = process.env.TEST_DOCUMENT_STORAGE_DIR || "storage/test-documents";
const testSeedPassword = process.env.TEST_SEED_USER_PASSWORD || "playwright-owner-pass";
const systemChromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => existsSync(candidate));

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      APP_PUBLIC_URL: baseURL,
      DATABASE_URL: testDatabaseUrl,
      DOCUMENT_STORAGE_DIR: testDocumentStorageDir,
      NODE_ENV: "development",
      PORT: String(testPort),
      RATE_LIMIT_STORE: "postgres",
      SEED_USER_PASSWORD: testSeedPassword,
      ZARINPAL_SANDBOX: "true",
      DISABLE_HMR: "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: systemChromiumPath ? { executablePath: systemChromiumPath } : undefined,
      },
    },
  ],
});
