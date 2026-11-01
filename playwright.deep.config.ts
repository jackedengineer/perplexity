import {defineConfig,devices} from '@playwright/test';
import {config} from 'dotenv';
config({path:'.env.deep.local',quiet:true});
if(process.env.LIVE_NEON_E2E!=='1'||process.env.ENABLE_DEEP_RESEARCH!=='true')throw new Error('Explicit development research browser configuration required');
export default defineConfig({testDir:'./tests/e2e',testMatch:'deep-research.spec.ts',outputDir:'.artifacts/deep-browser-results',workers:1,retries:0,forbidOnly:!!process.env.CI,timeout:60000,
 use:{baseURL:'http://localhost:3000',trace:'retain-on-failure'},projects:[{name:'desktop',use:{...devices['Desktop Chrome'],locale:'en-US'}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',locale:'en-IN'}}],
 webServer:{command:'pnpm dev',url:'http://localhost:3000',reuseExistingServer:true,stdout:'pipe'}});
