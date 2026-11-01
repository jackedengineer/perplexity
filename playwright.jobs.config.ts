import {defineConfig,devices} from '@playwright/test';
import {config} from 'dotenv';
config({path:'.env.local',quiet:true});
if(process.env.LIVE_NEON_E2E!=='1'||process.env.ENABLE_DURABLE_JOB_SANDBOX!=='true')throw new Error('Explicit development job sandbox required');
export default defineConfig({testDir:'./tests/e2e',testMatch:'durable-jobs.spec.ts',outputDir:'.artifacts/jobs-browser-results',workers:1,retries:0,forbidOnly:Boolean(process.env.CI),timeout:150000,
 use:{baseURL:'http://localhost:3000',trace:'retain-on-failure'},projects:[{name:'desktop',use:{...devices['Desktop Chrome'],locale:'en-US'}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',locale:'en-IN'}}],
 webServer:{command:'pnpm dev',url:'http://localhost:3000',reuseExistingServer:true,stdout:'pipe'}});
