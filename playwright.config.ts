import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: process.env.LIVE_NEON_E2E ? ["**/live-session.spec.ts", "**/private-conversations.spec.ts"] : "**/foundation.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: "pnpm start --hostname 127.0.0.1",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: process.env.LIVE_NEON_E2E ? {} : {
      DATABASE_URL: "postgresql://localhost/unused_e2e",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "isolated-e2e-only-secret-not-a-live-credential",
      GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "test-only",
    },
  },
});
