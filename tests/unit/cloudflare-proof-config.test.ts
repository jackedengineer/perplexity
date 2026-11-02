import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';

it('keeps the compatibility worker separate from the custom domain, billing and schedules',async()=>{
 const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
 expect(config.name).toBe('perplex-compatibility-proof');
 expect(config.main).toBe('.open-next/worker.js');
 expect(config.compatibility_flags).toContain('nodejs_compat');
 expect(config.routes).toBeUndefined();expect(config.triggers).toBeUndefined();
 expect(config.vars.DEPLOYMENT_PLATFORM).toBe('cloudflare');
 for(const key of ['ENABLE_GUEST_TRIALS','ENABLE_DURABLE_JOB_SANDBOX','ENABLE_RAZORPAY_TEST_CHECKOUT','ENABLE_RAZORPAY_LIVE_BILLING','ENABLE_DEEP_RESEARCH','ENABLE_JOB_SCHEDULE'])expect(config.vars[key]).toBe('false');
 for(const key of Object.keys(config.vars))expect(key).not.toMatch(/SECRET|API_KEY|DATABASE_URL/u);
});
it('keeps database caching out of the initial OpenNext proof and secrets out of git',async()=>{
 const config=await readFile('open-next.config.ts','utf8');
 expect(config).toContain('defineCloudflareConfig({})');
 const ignore=await readFile('.gitignore','utf8');
 expect(ignore).toContain('.open-next/');expect(ignore).toContain('.wrangler/');expect(ignore).toContain('.dev.vars*');
});
