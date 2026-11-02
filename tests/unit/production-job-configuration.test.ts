import {expect,it} from 'vitest';
import {jobAccessConfiguration,jobConfiguration,jobMaintenanceConfiguration} from '@/server/jobs/configuration';
import {paymentConfiguration} from '@/server/payments/config';

const database='postgresql://perplex_web:synthetic@ep-small-bread-b3we4v54-pooler.c-4.ap-southeast-1.aws.neon.tech/perplex?sslmode=verify-full';
const production={APPLICATION_ENV:'production',DEPLOYMENT_PLATFORM:'cloudflare',BETTER_AUTH_URL:'https://perplexity.jacked.dev',
 DATABASE_URL:database,JOB_ENVIRONMENT:'LIVE',ENABLE_PRODUCTION_JOBS:'true',JOB_OPERATOR_BUDGET_KEY:'live-pilot-20261102'};
it('keeps authenticated financial recovery configured while new research is paused',()=>{
 const paused={...production,ENABLE_PRODUCTION_JOBS:'false',ENABLE_RAZORPAY_LIVE_BILLING:'true'};
 expect(()=>jobConfiguration(paused)).toThrow();
 expect(jobAccessConfiguration(paused)).toEqual({mode:'LIVE',databaseUrl:database,budgetKey:'live-pilot-20261102'});
 expect(jobMaintenanceConfiguration(paused)).toEqual({mode:'LIVE',databaseUrl:database,budgetKey:'live-pilot-20261102'});
 for(const patch of [{ENABLE_RAZORPAY_LIVE_BILLING:'false'},{DATABASE_URL:database.replace('perplex_web','perplex_owner')},
  {BETTER_AUTH_URL:'https://untrusted.test'},{ENABLE_DURABLE_JOB_SANDBOX:'true'},{JOB_OPERATOR_BUDGET_KEY:'test-fixture'}]){
  expect(()=>jobMaintenanceConfiguration({...paused,...patch})).toThrow();
 }
});
it('requires an explicit LIVE job environment, production host and restricted production database',()=>{
 expect(jobConfiguration(production)).toEqual({mode:'LIVE',databaseUrl:database,budgetKey:'live-pilot-20261102'});
 for(const patch of [{APPLICATION_ENV:'development'},{DEPLOYMENT_PLATFORM:'vercel'},{VERCEL_ENV:'preview'},
  {BETTER_AUTH_URL:'https://perplexity.jacked.dev.attacker.test'},{ENABLE_PRODUCTION_JOBS:'false'},
  {JOB_OPERATOR_BUDGET_KEY:'test-fixture'},{ENABLE_DURABLE_JOB_SANDBOX:'true'},
  {DATABASE_URL:database.replace('perplex_web','perplex_owner')},
  {DATABASE_URL:database.replace('verify-full','require')},
  {DATABASE_URL:database.replace('ep-small-bread','ep-other')},{JOB_DATABASE_URL:database}]){
  expect(()=>jobConfiguration({...production,...patch})).toThrow();
 }
});
it('does not reinterpret TEST configuration or accept missing mode as production',()=>{
 expect(()=>jobConfiguration({...production,JOB_ENVIRONMENT:undefined})).toThrow();
 expect(()=>jobConfiguration({...production,JOB_ENVIRONMENT:'TEST'})).toThrow();
 const development={DATABASE_URL:database.replace('ep-small-bread-b3we4v54-pooler.c-4','ep-sweet-night-az8bacv2-pooler.c-3'),ENABLE_DURABLE_JOB_SANDBOX:'true',JOB_OPERATOR_BUDGET_KEY:'test-fixture'};
 expect(jobConfiguration(development)).toMatchObject({mode:'TEST',budgetKey:'test-fixture'});
});
it('supports LIVE billing recovery on the production Cloudflare origin without opening purchases',()=>{
 const worker={JOB_EXECUTION_BACKEND:'cloudflare',ENABLE_CLOUDFLARE_JOB_WORKER:'true',ENABLE_DEEP_RESEARCH:'true',JOB_OPENROUTER_API_KEY:'sk-or-v1-synthetic-pilot-key',JOB_TAVILY_API_KEY:'tvly-synthetic-pilot-key',MODEL_SAFETY:'test/safety',SAFETY_OPENROUTER_PROVIDER:'test',MODEL_PLANNER:'test/planner',PLANNER_OPENROUTER_PROVIDER:'test',MODEL_ANSWER:'test/answer',ANSWER_OPENROUTER_PROVIDER:'test'};
 const keys={RAZORPAY_KEY_ID:'rzp_live_synthetic',RAZORPAY_KEY_SECRET:'s'.repeat(32),RAZORPAY_PRO_PLAN_ID:'plan_synthetic',RAZORPAY_WEBHOOK_SECRET:'w'.repeat(32)};
 expect(paymentConfiguration({...production,...keys,ENABLE_RAZORPAY_LIVE_BILLING:'true'})).toMatchObject({mode:'LIVE',purchasesEnabled:false});
 const enabled={...production,...keys,...worker,ENABLE_RAZORPAY_LIVE_BILLING:'true',ENABLE_RAZORPAY_LIVE_CHECKOUT:'true',PAID_PILOT_PROVIDER_EXPIRES_AT:'2026-12-12T00:00:00Z'};
 expect(paymentConfiguration(enabled)).toMatchObject({mode:'LIVE',purchasesEnabled:true});
 for(const patch of [{JOB_OPENROUTER_API_KEY:undefined},{JOB_TAVILY_API_KEY:undefined},{ENABLE_CLOUDFLARE_JOB_WORKER:'false'},{JOB_EXECUTION_BACKEND:'trigger'}])expect(paymentConfiguration({...enabled,...patch}).purchasesEnabled).toBe(false);
 expect(()=>paymentConfiguration({...production,...keys,ENABLE_RAZORPAY_LIVE_BILLING:'true',BETTER_AUTH_URL:'https://preview.example.test'})).toThrow();
});
