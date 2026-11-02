export type JobEnvironment='TEST'|'LIVE';
type Environment=Record<string,string|undefined>;
const developmentHost='ep-sweet-night-az8bacv2-pooler.c-3.ap-southeast-1.aws.neon.tech';
const productionHost='ep-small-bread-b3we4v54-pooler.c-4.ap-southeast-1.aws.neon.tech';
function pinnedDatabase(value:string|undefined,host:string){
 const url=new URL(value??'');
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.password||url.port&&url.port!=='5432'||url.hostname!==host||url.username!=='perplex_web'||url.pathname!=='/perplex'||url.searchParams.get('sslmode')!=='verify-full')throw new Error('Restricted job database required');
 return value!;
}
export function cloudflareProductionDatabase(env:Environment){
 if(env.APPLICATION_ENV!=='production'||env.DEPLOYMENT_PLATFORM!=='cloudflare'||env.VERCEL_ENV!==undefined||env.BETTER_AUTH_URL!=='https://perplexity.jacked.dev'||env.JOB_DATABASE_URL!==undefined)throw new Error('Production deployment is not configured');
 return pinnedDatabase(env.DATABASE_URL,productionHost);
}
export function sandboxDatabaseUrl(env:Environment=process.env){
 if(env.ENABLE_DURABLE_JOB_SANDBOX!=='true'||env.VERCEL_ENV==='production'||env.APPLICATION_ENV==='production'||env.JOB_ENVIRONMENT==='LIVE')throw new Error('Job sandbox is not configured');
 return pinnedDatabase(env.JOB_DATABASE_URL??env.DATABASE_URL,developmentHost);
}
export function workerBudgetKey(env:Environment=process.env){
 const key=env.JOB_OPERATOR_BUDGET_KEY,prefix=env.JOB_ENVIRONMENT==='LIVE'?'live-':'test-';
 if(!key||!key.startsWith(prefix)||!/^(?:live|test)-[A-Za-z0-9-]{1,55}$/u.test(key))throw new Error('Mode-bound job namespace required');
 return key;
}
export function jobAccessConfiguration(env:Environment=process.env){
 const mode=env.JOB_ENVIRONMENT??'TEST';
 if(mode!=='TEST'&&mode!=='LIVE')throw new Error('Unknown job environment');
 if(mode==='LIVE'&&env.ENABLE_DURABLE_JOB_SANDBOX==='true')throw new Error('Production sandbox is forbidden');
 return {mode:mode as JobEnvironment,databaseUrl:mode==='LIVE'?cloudflareProductionDatabase(env):sandboxDatabaseUrl(env),budgetKey:workerBudgetKey(env)};
}
export function jobConfiguration(env:Environment=process.env){
 const config=jobAccessConfiguration(env);
 if(config.mode==='LIVE'&&env.ENABLE_PRODUCTION_JOBS!=='true')throw new Error('Production jobs are disabled');
 return config;
}
export function jobMaintenanceConfiguration(env:Environment=process.env){
 if(env.JOB_ENVIRONMENT!=='LIVE')return jobConfiguration(env);
 if(env.ENABLE_DURABLE_JOB_SANDBOX==='true'||env.ENABLE_RAZORPAY_LIVE_BILLING!=='true'&&env.ENABLE_PRODUCTION_JOBS!=='true')throw new Error('Production maintenance is disabled');
 return jobAccessConfiguration(env);
}
