import {configuredResearchModels} from '@/server/deep-research/configuration';
import {JobError} from './contracts';
export function configuredJobResearchModels(env:Record<string,string|undefined>=process.env){
 return configuredResearchModels(env.JOB_EXECUTION_BACKEND==='cloudflare'?cloudflareProviderEnvironment(env):env);
}
export function cloudflareProviderEnvironment(env:Record<string,string|undefined>){
 const key=env.JOB_OPENROUTER_API_KEY,search=env.JOB_TAVILY_API_KEY;
 if(env.JOB_EXECUTION_BACKEND!=='cloudflare'||env.ENABLE_CLOUDFLARE_JOB_WORKER!=='true'||
  !key||!/^sk-or-[A-Za-z0-9_-]{16,240}$/u.test(key)||!search||!/^tvly-[A-Za-z0-9_-]{12,240}$/u.test(search))throw new JobError('DISABLED');
 const paid=Object.freeze({...env,OPENROUTER_API_KEY:key,TAVILY_API_KEY:search});
 configuredResearchModels(paid);return paid;
}
