import {defineConfig,devices} from '@playwright/test';
import {config} from 'dotenv';

config({path:'.env.cf-proof.local',quiet:true});
if(process.env.LIVE_NEON_ADMISSION!=='1')throw new Error('Explicit development Neon proof required');
export default defineConfig({
 outputDir:'.artifacts/cloudflare-neon-results',
 testDir:'./tests/e2e',testMatch:['cloudflare-database.spec.ts','cloudflare-delivery.spec.ts'],workers:1,retries:0,
 forbidOnly:!!process.env.CI,timeout:60000,
 use:{baseURL:'http://localhost:8787',trace:'retain-on-failure'},
 projects:[
  {name:'cloudflare-neon-desktop',use:{...devices['Desktop Chrome']}},
  {name:'cloudflare-neon-mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',viewport:{width:320,height:740}}},
 ],
 webServer:{command:'pnpm cf:preview',url:'http://localhost:8787',timeout:90000,
  reuseExistingServer:process.env.CF_REUSE_SERVER==='true'&&!process.env.CI,
  env:{WRANGLER_SEND_METRICS:'false'}},
});
