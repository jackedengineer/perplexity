import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
// Memory in a real browser: development Neon and synthetic providers.
config({ path: ".env.local", quiet: true });
if (process.env.LIVE_NEON_E2E !== "1") throw new Error("Explicit development Neon opt-in required");
process.env.LIVE_NEON_ADMISSION = "1";
const budgetKey = process.env.T11_TEST_BUDGET_KEY ?? `test-memory-browser-${randomUUID()}`;
process.env.T11_TEST_BUDGET_KEY = budgetKey;
export default defineConfig({
  testDir: "./tests/e2e", testMatch: ["**/memory.spec.ts"], outputDir: ".artifacts/memory-browser-results", workers: 1, retries: 0, forbidOnly: Boolean(process.env.CI), timeout: 120000,
  use: { baseURL: "http://localhost:3001", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  webServer: { command: "node --import ./tests/e2e/search-provider-preload.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001", url: "http://localhost:3001", reuseExistingServer: false, stdout: "pipe",
    env: { ENABLE_DOCUMENTS: "true", DOCUMENT_STORE_DIR: ".artifacts/document-store", ENABLE_GUEST_TRIALS: "true", ENABLED_ANSWER_MODELS: "economy-nano", VERCEL: "1", BETTER_AUTH_URL: "http://localhost:3001", T11_PROVIDER_FIXTURE: "1",
      OPENROUTER_API_KEY: "t11-synthetic-provider-key", TAVILY_API_KEY: "t11-synthetic-search-key", MODEL_PLANNER: "test/planner", PLANNER_OPENROUTER_PROVIDER: "test", MODEL_SAFETY: "test/safety", SAFETY_OPENROUTER_PROVIDER: "test",
      MODEL_ANSWER: "openai/gpt-4.1-mini", ANSWER_OPENROUTER_PROVIDER: "azure", RUN_HMAC_ACTIVE_KEY_ID: "test-v1", RUN_HMAC_KEYS_JSON: JSON.stringify({ "test-v1": "a".repeat(64) }), RUN_OPERATOR_BUDGET_KEY: budgetKey } },
});
