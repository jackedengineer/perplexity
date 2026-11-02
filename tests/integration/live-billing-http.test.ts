import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createHmac} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {billingInbox,billingCheckouts,jobPeriods} from '@/db/schema';
import {jobsFixture} from './jobs-fixture';
import {liveOffer} from '@/server/payments/offer';
const state=vi.hoisted(()=>({db:undefined as unknown,subject:'',anonymous:false,verified:true,after:vi.fn(),jobs:false,wake:vi.fn(async()=>{})}));
vi.mock('server-only',()=>({}));
vi.mock('next/server',()=>({after:(fn:()=>unknown)=>state.after(fn)}));
vi.mock('@/db',()=>({getDb:()=>state.db}));
vi.mock('@/lib/current-session',()=>({getCurrentSession:async()=>({user:{id:state.subject,isAnonymous:state.anonymous,emailVerified:state.verified}})}));
vi.mock('@/lib/env',()=>({getServerEnv:()=>({BETTER_AUTH_URL:'https://perplexity-gold-alpha.vercel.app'})}));
vi.mock('@/server/jobs/service',()=>({jobsEnabled:()=>state.jobs}));
vi.mock('@/server/jobs/cloudflare-wake',()=>({wakeCloudflareJobs:()=>state.wake()}));
vi.mock('@/server/runs/rate-limit',()=>({createRequestLimiter:()=>({consume:async()=>{}})}));
import {billingEnabled,paymentsHttp,purchasesEnabled} from '@/server/payments/service';
let f:Awaited<ReturnType<typeof jobsFixture>>,id='';
const origin='https://perplexity-gold-alpha.vercel.app',webhook='synthetic-production-webhook-secret';
const fetcher=vi.fn<typeof fetch>(async()=>Response.json({id:'sub_httplive',plan_id:'plan_httplive',quantity:1,status:'cancelled',notes:{checkoutId:id,priceKey:liveOffer.priceKey}}));
beforeAll(async()=>{
 f=await jobsFixture();state.db=f.db;state.subject=f.subject;
 const env={ENABLE_RAZORPAY_LIVE_BILLING:'true',ENABLE_RAZORPAY_TEST_CHECKOUT:'false',VERCEL_ENV:'production',BETTER_AUTH_URL:origin,
  DATABASE_URL:'postgresql://perplex_web:synthetic@ep-small-bread-b3we4v54-pooler.c-4.ap-southeast-1.aws.neon.tech/perplex?sslmode=verify-full',
  RAZORPAY_KEY_ID:'rzp_live_httpfixture',RAZORPAY_KEY_SECRET:'synthetic-live-payment-secret',RAZORPAY_PRO_PLAN_ID:'plan_httplive',RAZORPAY_WEBHOOK_SECRET:webhook};
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 vi.stubEnv('JOB_DATABASE_URL',undefined);vi.stubGlobal('fetch',fetcher);
 const [row]=await f.db.insert(billingCheckouts).values({userId:f.owner,requestId:crypto.randomUUID(),environment:'LIVE',priceKey:liveOffer.priceKey,planId:'plan_httplive',subscriptionId:'sub_httplive',state:'READY'}).returning();id=row.id;
 await f.db.insert(jobPeriods).values({userId:f.owner,environment:'LIVE',jobLimit:7,paymentId:'pay_httplive',invoiceId:'inv_httplive',subscriptionId:'sub_httplive',startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+3600000)});
},30000);
afterAll(async()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();await f?.pg.close();});
const post=(path:string,body?:unknown)=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
it('keeps live status available with durable admissions off and refuses all new purchases',async()=>{
 expect(billingEnabled()).toBe(true);expect(purchasesEnabled()).toBe(false);
 const response=await paymentsHttp.status();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(await response.json()).toMatchObject({mode:'LIVE',jobLimit:7,purchasesEnabled:false,access:{remaining:7}});
 const denied=await paymentsHttp.checkout(post('/api/billing/checkout',{requestId:crypto.randomUUID(),priceKey:liveOffer.priceKey}));
 expect(denied.status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
});
it('retains owned cancellation while new checkout is paused',async()=>{
 const response=await paymentsHttp.cancel(post('/api/billing/'+id+'/cancel'),id);expect(response.status).toBe(200);
 expect((await response.json()).access.remaining).toBe(7);
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/subscriptions/sub_httplive/cancel');
 const [period]=await f.db.select().from(jobPeriods).where(eq(jobPeriods.environment,'LIVE'));expect(period.state).toBe('ACTIVE');
});
it('returns owned billing and successful cancellation when the activity hint is unavailable',async()=>{
 const env={ENABLE_RAZORPAY_LIVE_CHECKOUT:'true',JOB_ENVIRONMENT:'LIVE',JOB_OPERATOR_BUDGET_KEY:'live-kv-test',
  APPLICATION_ENV:'production',DEPLOYMENT_PLATFORM:'cloudflare',BETTER_AUTH_URL:'https://perplexity.jacked.dev',
  ENABLE_PRODUCTION_JOBS:'true',JOB_EXECUTION_BACKEND:'cloudflare',ENABLE_CLOUDFLARE_JOB_WORKER:'true',ENABLE_DEEP_RESEARCH:'true',
  JOB_OPENROUTER_API_KEY:'sk-or-v1-synthetic-dedicated-key',JOB_TAVILY_API_KEY:'tvly-dev-synthetic-dedicated-key',
  MODEL_SAFETY:'test/safety',SAFETY_OPENROUTER_PROVIDER:'test',MODEL_PLANNER:'test/planner',PLANNER_OPENROUTER_PROVIDER:'test',MODEL_ANSWER:'test/answer',ANSWER_OPENROUTER_PROVIDER:'test',
  PAID_PILOT_PROVIDER_EXPIRES_AT:new Date(Date.now()+40*86400000).toISOString()};
 const prior=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
 const previousVercel=process.env.VERCEL_ENV;
 try{
  for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
  vi.stubEnv('VERCEL_ENV',undefined);state.jobs=true;state.wake.mockRejectedValue(new Error('KV unavailable'));
  expect(purchasesEnabled()).toBe(true);
  const status=await paymentsHttp.status();expect(status.status).toBe(200);
  expect(await status.json()).toMatchObject({purchasesEnabled:false,access:{remaining:7},checkouts:[{id}]});
  await f.db.update(billingCheckouts).set({cancelAtCycleEnd:false}).where(eq(billingCheckouts.id,id));
  const cancelled=await paymentsHttp.cancel(post('/api/billing/'+id+'/cancel'),id);
  expect(cancelled.status).toBe(200);expect((await cancelled.json()).checkouts[0].cancelAtCycleEnd).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
 }finally{
  for(const [key,value] of Object.entries(prior))vi.stubEnv(key,value);
  vi.stubEnv('VERCEL_ENV',previousVercel);state.jobs=false;state.wake.mockResolvedValue(undefined);
 }
});
it('ingests live signed events durably with inference off and rejects another signing secret',async()=>{
 const bytes=JSON.stringify({event:'payment.refunded',payload:{payment:{entity:{id:'pay_httplive'}}}});
 const request=(secret:string)=>new Request(origin+'/api/webhooks/razorpay',{method:'POST',headers:{'content-type':'application/json','x-razorpay-event-id':'evt_httplive','x-razorpay-signature':createHmac('sha256',secret).update(bytes).digest('hex')},body:bytes});
 expect((await paymentsHttp.webhook(request('another-test-webhook-signing-secret'))).status).toBe(400);
 expect(await f.db.select().from(billingInbox)).toHaveLength(0);
 expect((await paymentsHttp.webhook(request(webhook))).status).toBe(202);
 expect((await f.db.select().from(billingInbox))[0]).toMatchObject({environment:'LIVE',state:'PENDING'});
 expect(state.after).toHaveBeenCalledTimes(1);
 expect((await f.db.select().from(jobPeriods).where(eq(jobPeriods.environment,'LIVE')))[0].state).toBe('REVOKED');
});
it('rejects guests, unverified accounts and cross-origin cancellation',async()=>{
 state.anonymous=true;expect((await paymentsHttp.status()).status).toBe(401);state.anonymous=false;
 state.verified=false;expect((await paymentsHttp.status()).status).toBe(401);state.verified=true;
 expect((await paymentsHttp.cancel(new Request(origin+'/api/billing/'+id+'/cancel',{method:'POST',headers:{origin:'https://attacker.test'}}),id)).status).toBe(403);
 expect(fetcher).not.toHaveBeenCalled();
});
