import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({admit:vi.fn<(...args:unknown[])=>Promise<string>>(async()=>crypto.randomUUID())}));
vi.mock('server-only',()=>({}));
vi.mock('next/server',()=>({after:vi.fn()}));
vi.mock('@/db',()=>({getDb:()=>({})}));
vi.mock('@/lib/current-session',()=>({getCurrentSession:async()=>({user:{id:'paid-owner',isAnonymous:false,emailVerified:true}})}));
vi.mock('@/lib/env',()=>({getServerEnv:()=>({BETTER_AUTH_URL:'https://perplexity.jacked.dev'})}));
vi.mock('@/server/runs/rate-limit',()=>({createRequestLimiter:()=>({consume:async()=>{}})}));
vi.mock('@/server/jobs/admission',()=>({admitJob:mocks.admit,listJobs:vi.fn(),readJob:vi.fn(),readEvents:vi.fn()}));
import {jobsHttp,jobsEnabled} from '@/server/jobs/service';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('admits paid research using the dedicated worker models with ordinary credentials disabled',async()=>{
 const env={JOB_ENVIRONMENT:'LIVE',JOB_OPERATOR_BUDGET_KEY:'live-pilot-test',APPLICATION_ENV:'production',DEPLOYMENT_PLATFORM:'cloudflare',
  BETTER_AUTH_URL:'https://perplexity.jacked.dev',DATABASE_URL:'postgresql://perplex_web:synthetic@ep-small-bread-b3we4v54-pooler.c-4.ap-southeast-1.aws.neon.tech/perplex?sslmode=verify-full',
  JOB_EXECUTION_BACKEND:'cloudflare',ENABLE_PRODUCTION_JOBS:'true',ENABLE_CLOUDFLARE_JOB_WORKER:'true',ENABLE_DEEP_RESEARCH:'true',
  OPENROUTER_API_KEY:'disabled',TAVILY_API_KEY:'disabled',JOB_OPENROUTER_API_KEY:'sk-or-v1-paid-pilot-dedicated',JOB_TAVILY_API_KEY:'tvly-dev-paid-pilot-dedicated',
  MODEL_SAFETY:'test/safety',SAFETY_OPENROUTER_PROVIDER:'test',MODEL_PLANNER:'test/planner',PLANNER_OPENROUTER_PROVIDER:'test',MODEL_ANSWER:'test/answer',ANSWER_OPENROUTER_PROVIDER:'test'};
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 vi.stubEnv('VERCEL_ENV',undefined);vi.stubEnv('JOB_DATABASE_URL',undefined);
 expect(jobsEnabled()).toBe(true);
 const response=await jobsHttp.submit(new Request('https://perplexity.jacked.dev/api/jobs',{method:'POST',headers:{origin:'https://perplexity.jacked.dev','content-type':'application/json'},body:JSON.stringify({version:1,workflow:'deep-research-v1',requestId:crypto.randomUUID(),question:'How do rainbows form?',locale:'en'})}));
 expect(response.status).toBe(202);
 expect(mocks.admit.mock.calls[0][4]).toMatchObject({safety:{modelId:'test/safety'},planner:{modelId:'test/planner'},answer:{modelId:'test/answer'}});
});
