import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({recover:vi.fn(async()=>0),billing:vi.fn(async()=>{}),cleanup:vi.fn(async()=>0),consume:vi.fn(async()=> 'COMPLETED'),dispatch:vi.fn(async(_db:unknown,_key:string,consume:(id:string)=>Promise<unknown>)=>{await consume('job');return 'EXECUTED';}),record:vi.fn(async(_db:unknown,_key:string,work:()=>Promise<unknown>)=>work())}));
vi.mock('@/server/jobs/worker',()=>({recoverJobs:mocks.recover}));
vi.mock('@/server/payments/maintenance',()=>({maintainBilling:mocks.billing}));
vi.mock('@/server/jobs/privacy',()=>({pruneJobEvidence:mocks.cleanup}));
vi.mock('@/server/jobs/consumer',()=>({consumeJob:mocks.consume}));
vi.mock('@/server/jobs/cloudflare-dispatch',()=>({dispatchCloudflareJob:mocks.dispatch}));
vi.mock('@/server/jobs/maintenance',async original=>({...await original<typeof import('@/server/jobs/maintenance')>(),recordJobMaintenance:mocks.record}));
import {runCloudflarePaidTick} from '@/server/jobs/cloudflare-runtime';
const env={APPLICATION_ENV:'production',DEPLOYMENT_PLATFORM:'cloudflare',BETTER_AUTH_URL:'https://perplexity.jacked.dev',DATABASE_URL:'postgresql://perplex_web:synthetic@ep-small-bread-b3we4v54-pooler.c-4.ap-southeast-1.aws.neon.tech/perplex?sslmode=verify-full',JOB_ENVIRONMENT:'LIVE',JOB_OPERATOR_BUDGET_KEY:'live-runtime',JOB_EXECUTION_BACKEND:'cloudflare',ENABLE_PRODUCTION_JOBS:'true',ENABLE_CLOUDFLARE_JOB_WORKER:'true',ENABLE_DEEP_RESEARCH:'true',ENABLE_RAZORPAY_LIVE_BILLING:'true',JOB_OPENROUTER_API_KEY:'sk-or-v1-dedicated-pilot',JOB_TAVILY_API_KEY:'tvly-dedicated-pilot',MODEL_SAFETY:'test/safety',SAFETY_OPENROUTER_PROVIDER:'test',MODEL_PLANNER:'test/planner',PLANNER_OPENROUTER_PROVIDER:'test',MODEL_ANSWER:'test/answer',ANSWER_OPENROUTER_PROVIDER:'test',RAZORPAY_KEY_ID:'rzp_live_synthetic',RAZORPAY_KEY_SECRET:'s'.repeat(32),RAZORPAY_PRO_PLAN_ID:'plan_synthetic',RAZORPAY_WEBHOOK_SECRET:'w'.repeat(32)};
const activity={get:vi.fn(async()=>String(Date.now()+3600000)),put:vi.fn(async()=>{})};
afterEach(()=>{vi.clearAllMocks();});
it('uses an invocation-owned pool and dedicated provider environment, then closes after execution',async()=>{
 const close=vi.fn(async()=>{}),db={} as never,open=vi.fn(()=>({db,close}));
 expect(await runCloudflarePaidTick(env,activity,false,open)).toBe('EXECUTED');
 expect(open).toHaveBeenCalledWith(env.DATABASE_URL);expect(mocks.billing).toHaveBeenCalledWith(db,env);
 expect(mocks.consume).toHaveBeenCalledWith(db,'job',expect.objectContaining({budgetKey:'live-runtime',environment:'LIVE',signal:expect.any(AbortSignal),providerEnvironment:expect.objectContaining({OPENROUTER_API_KEY:env.JOB_OPENROUTER_API_KEY,TAVILY_API_KEY:env.JOB_TAVILY_API_KEY})}));
 expect(close).toHaveBeenCalledOnce();expect(mocks.record).toHaveBeenCalledOnce();
});
it('does not open Neon during idle minutes; hourly fallback ignores an absent activity marker',async()=>{
 const open=vi.fn(()=>({db:{} as never,close:vi.fn(async()=>{})})),idle={get:async()=>null,put:async()=>{}};
 expect(await runCloudflarePaidTick(env,idle,false,open)).toBe('IDLE');expect(open).not.toHaveBeenCalled();
 expect(await runCloudflarePaidTick(env,idle,true,open)).toBe('EXECUTED');expect(open).toHaveBeenCalledOnce();
});
it('recovers billing and deadlines but never executes or marks ready when paused or unfunded',async()=>{
 for(const patch of [{ENABLE_PRODUCTION_JOBS:'false'},{JOB_OPENROUTER_API_KEY:undefined}]){
  const close=vi.fn(async()=>{}),open=()=>({db:{} as never,close});
  expect(await runCloudflarePaidTick({...env,...patch},activity,false,open)).toBe('PAUSED');
  expect(close).toHaveBeenCalledOnce();
 }
 expect(mocks.recover).toHaveBeenCalledTimes(2);expect(mocks.billing).toHaveBeenCalledTimes(2);expect(mocks.cleanup).toHaveBeenCalledTimes(2);expect(mocks.dispatch).not.toHaveBeenCalled();
});
it('closes after failures and does not let a recovery error suppress financial maintenance',async()=>{
 const close=vi.fn(async()=>{});mocks.recover.mockRejectedValueOnce(new Error('Database unavailable'));
 await expect(runCloudflarePaidTick(env,activity,false,()=>({db:{} as never,close}))).rejects.toThrow('Database unavailable');
 expect(mocks.billing).toHaveBeenCalledOnce();expect(mocks.cleanup).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();expect(mocks.dispatch).not.toHaveBeenCalled();
});
