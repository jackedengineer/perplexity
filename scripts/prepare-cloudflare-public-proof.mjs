import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';

// Generate an isolated, credential-free hosted probe. Never read .env/.dev.vars
// or inherit process.env: the real application configuration is a separate gate.
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
if(config.name!=='perplex-compatibility-proof'||config.routes||config.triggers||config.env)throw new Error('Isolated proof configuration required');
await access('.open-next/worker.js');
config.main=resolve('.open-next/worker.js');
config.assets.directory=resolve('.open-next/assets');
config.vars={
 DEPLOYMENT_PLATFORM:'cloudflare',NEXTJS_ENV:'production',
 ENABLE_GUEST_TRIALS:'false',ENABLE_DURABLE_JOB_SANDBOX:'false',
 ENABLE_RAZORPAY_TEST_CHECKOUT:'false',ENABLE_DEEP_RESEARCH:'false',
 ENABLE_JOB_SCHEDULE:'false',ENABLE_RAZORPAY_LIVE_BILLING:'false',
 BETTER_AUTH_URL:'https://perplex-compatibility-proof.ichiragbhugra.workers.dev',
 DATABASE_URL:'postgresql://localhost/disabled_cloudflare_proof',
 GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'synthetic-proof-only',
 // Random placeholder only: no database, Google app or user is attached to it.
 BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),
};
await mkdir('.artifacts',{recursive:true});
await writeFile('.artifacts/wrangler-hosted-public.json',JSON.stringify(config,null,2)+'\n',{mode:0o600});
console.log('Prepared .artifacts/wrangler-hosted-public.json; no deployment performed.');
