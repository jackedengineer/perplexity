import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';
const developmentHost='ep-sweet-night-az8bacv2-pooler.c-3.ap-southeast-1.aws.neon.tech';
export function sandboxDatabaseUrl(env:Record<string,string|undefined>=process.env){
 const value=env.JOB_DATABASE_URL??env.DATABASE_URL;
 const url=new URL(value??'');
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.password||url.port&&!['5432'].includes(url.port)||env.ENABLE_DURABLE_JOB_SANDBOX!=='true'||env.VERCEL_ENV==='production'||url.hostname!==developmentHost||url.username!=='perplex_web'||url.pathname!=='/perplex'||url.searchParams.get('sslmode')!=='verify-full')throw new Error('Job sandbox is not configured');
 return value!;
}
let pool:Pool|undefined;
export function workerDatabase(){
 if(!pool){pool=new Pool({connectionString:sandboxDatabaseUrl(),max:2,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:10000,idleTimeoutMillis:10000,keepAlive:true,keepAliveInitialDelayMillis:10000,application_name:'perplex-jobs-dev'});
  pool.on('error',()=>console.warn(JSON.stringify({event:'jobs.database_pool',outcome:'UNAVAILABLE'})));
 }
 return drizzle(pool,{schema});
}
export async function closeWorkerDatabase(){await pool?.end();pool=undefined;}

export function workerBudgetKey(){const key=process.env.JOB_OPERATOR_BUDGET_KEY;if(!key||!/^test-[A-Za-z0-9-]{1,55}$/u.test(key))throw new Error('Bounded development job namespace required');return key;}
