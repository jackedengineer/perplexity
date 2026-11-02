import {defineConfig,devices} from '@playwright/test';

// Run against the built Worker, not `next dev` or a transport stand-in.
export default defineConfig({
 outputDir:'.artifacts/cloudflare-public-results',
 testDir:'./tests/e2e',testMatch:'foundation.spec.ts',workers:1,retries:0,
 forbidOnly:!!process.env.CI,
 use:{baseURL:'http://localhost:8787',trace:'retain-on-failure'},
 projects:[
  {name:'cloudflare-desktop',use:{...devices['Desktop Chrome']}},
  {name:'cloudflare-mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',viewport:{width:320,height:740}}},
 ],
 webServer:{command:'pnpm cf:preview',url:'http://localhost:8787',timeout:90000,
  reuseExistingServer:process.env.CF_REUSE_SERVER==='true'&&!process.env.CI,
  env:{WRANGLER_SEND_METRICS:'false'}},
});
