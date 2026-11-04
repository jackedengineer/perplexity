import {expect,it} from 'vitest';
import {cloudflareProviderEnvironment} from '@/server/jobs/cloudflare-configuration';
const env={JOB_EXECUTION_BACKEND:'cloudflare',ENABLE_CLOUDFLARE_JOB_WORKER:'true',ENABLE_DEEP_RESEARCH:'true',
 OPENROUTER_API_KEY:'sk-or-v1-ordinary-verification',TAVILY_API_KEY:'tvly-dev-ordinary-verification',
 JOB_OPENROUTER_API_KEY:'sk-or-v1-paid-pilot-dedicated',JOB_TAVILY_API_KEY:'tvly-dev-paid-pilot-dedicated',
 MODEL_SAFETY:'test/safety',SAFETY_OPENROUTER_PROVIDER:'test',MODEL_PLANNER:'test/planner',PLANNER_OPENROUTER_PROVIDER:'test',MODEL_ANSWER:'test/answer',ANSWER_OPENROUTER_PROVIDER:'test'};
it('selects dedicated paid credentials without mutating the ordinary research environment',()=>{
 const paid=cloudflareProviderEnvironment(env);
 expect(paid.OPENROUTER_API_KEY).toBe(env.JOB_OPENROUTER_API_KEY);expect(paid.TAVILY_API_KEY).toBe(env.JOB_TAVILY_API_KEY);
 expect(env.OPENROUTER_API_KEY).toBe('sk-or-v1-ordinary-verification');
});
it('cannot fall back to verification credentials or an unconfigured execution backend',()=>{
 for(const patch of [{JOB_OPENROUTER_API_KEY:undefined},{JOB_TAVILY_API_KEY:undefined},{JOB_EXECUTION_BACKEND:'trigger'},
  {ENABLE_CLOUDFLARE_JOB_WORKER:'false'},{ENABLE_DEEP_RESEARCH:'false'},{MODEL_PLANNER:undefined}]){
  expect(()=>cloudflareProviderEnvironment({...env,...patch})).toThrow();
 }
});
