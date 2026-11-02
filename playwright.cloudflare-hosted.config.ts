import {defineConfig,devices} from '@playwright/test';

// Manual opt-in to the isolated public proof only. No production host, credentials
// or deploy step; these cases never contact an AI/payment provider.
if(process.env.CF_HOSTED_PUBLIC_PROOF!=='1')throw new Error('Explicit hosted proof opt-in required');
export default defineConfig({
 outputDir:'.artifacts/cloudflare-hosted-results',
 testDir:'./tests/e2e',testMatch:['foundation.spec.ts','cloudflare-cache.spec.ts'],workers:1,retries:0,
 forbidOnly:!!process.env.CI,
 use:{baseURL:'https://perplex-compatibility-proof.ichiragbhugra.workers.dev',trace:'retain-on-failure'},
 projects:[
  {name:'cloudflare-hosted-desktop',use:{...devices['Desktop Chrome']}},
  {name:'cloudflare-hosted-mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',viewport:{width:320,height:740}}},
 ],
});
