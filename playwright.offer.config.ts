import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',testMatch:'paid-offer.spec.ts',workers:1,retries:0,
  forbidOnly:!!process.env.CI,
  use:{baseURL:'http://localhost:3101',trace:'retain-on-failure'},
  projects:[
    {name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
    {name:'small-mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',viewport:{width:320,height:740}}},
  ],
  webServer:{command:'pnpm start --hostname 127.0.0.1 --port 3101',url:'http://localhost:3101',reuseExistingServer:false,
    env:{DATABASE_URL:'postgresql://localhost/unused_offer_e2e',BETTER_AUTH_URL:'http://localhost:3101',
      BETTER_AUTH_SECRET:'isolated-offer-test-only-not-a-production-credential',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-only',
      ENABLE_DURABLE_JOB_SANDBOX:'false',ENABLE_RAZORPAY_TEST_CHECKOUT:'false',ENABLE_DEEP_RESEARCH:'false',ENABLE_JOB_SCHEDULE:'false',
      OPENROUTER_API_KEY:'',TAVILY_API_KEY:''}},
});
