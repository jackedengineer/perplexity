import { defineConfig,devices } from "@playwright/test";
import { config } from "dotenv";
config({path:".env.local",quiet:true});
if(process.env.LIVE_NEON_E2E!=="1")throw new Error("Explicit development Neon opt-in required");
process.env.LIVE_NEON_ADMISSION="1";
const budgetKey="test-t11-browser";
process.env.T11_TEST_BUDGET_KEY=budgetKey;
export default defineConfig({testDir:"./tests/e2e",testMatch:["**/guarded-search.spec.ts","**/recovery.spec.ts","**/stale-run-recovery.spec.ts","**/cross-process-recovery.spec.ts","**/distributed-controls.spec.ts"],outputDir:".artifacts/t11-browser-results",workers:1,retries:0,forbidOnly:Boolean(process.env.CI),timeout:90000,
  use:{baseURL:"http://localhost:3001",trace:"retain-on-failure"},
  projects:[{name:"desktop",use:{...devices["Desktop Chrome"]}},{name:"mobile",use:{...devices["iPhone 13"],defaultBrowserType:"chromium"}}],
  webServer:{command:"node --import ./tests/e2e/search-provider-preload.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001",url:"http://localhost:3001",reuseExistingServer:false,stdout:"pipe",
    env:{BETTER_AUTH_URL:"http://localhost:3001",T11_PROVIDER_FIXTURE:"1",OPENROUTER_API_KEY:"t11-synthetic-provider-key",TAVILY_API_KEY:"t11-synthetic-search-key",MODEL_SAFETY:"test/safety",SAFETY_OPENROUTER_PROVIDER:"test",MODEL_ANSWER:"test/answer",ANSWER_OPENROUTER_PROVIDER:"test",RUN_HMAC_ACTIVE_KEY_ID:"test-v1",RUN_HMAC_KEYS_JSON:JSON.stringify({"test-v1":"a".repeat(64)}),RUN_OPERATOR_BUDGET_KEY:budgetKey}},
});
