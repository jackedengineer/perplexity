import {defineConfig,devices} from '@playwright/test';
import {config} from 'dotenv';
config({path:'.env.reviewer.e2e.local',quiet:true});
if(process.env.LIVE_REVIEWER_NEON!=='1'||!process.env.REVIEWER_LOGIN_CONFIG)throw new Error('Explicit development reviewer browser configuration required');
export default defineConfig({testDir:'./tests/e2e',testMatch:'reviewer-login.spec.ts',workers:1,retries:0,timeout:60000,
 use:{baseURL:'http://localhost:3102',trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
 webServer:{command:'pnpm dev --port 3102',url:'http://localhost:3102/reviewer-sign-in',reuseExistingServer:true,
  env:{BETTER_AUTH_URL:'http://localhost:3102',DATABASE_URL_DIRECT:'',ENABLE_GUEST_TRIALS:'false',ENABLE_DURABLE_JOB_SANDBOX:'false',ENABLE_RAZORPAY_TEST_CHECKOUT:'false',ENABLE_DEEP_RESEARCH:'false',OPENROUTER_API_KEY:'',TAVILY_API_KEY:''}},
});
