import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';
const developmentHost='ep-sweet-night-az8bacv2-pooler.c-3.ap-southeast-1.aws.neon.tech';
export function sandboxDatabaseUrl(env:NodeJS.ProcessEnv=process.env){
 const value=env.JOB_DATABASE_URL??env.DATABASE_URL;
 const url=new URL(value??'');
 if(env.ENABLE_DURABLE_JOB_SANDBOX!=='true'||env.VERCEL_ENV==='production'||url.hostname!==developmentHost||url.username!=='perplex_web'||url.pathname!=='/perplex'||url.searchParams.get('sslmode')!=='verify-full')throw new Error('Job sandbox is not configured');
 return value!;
}
let pool:Pool|undefined;
export function workerDatabase(){
 pool??=new Pool({connectionString:sandboxDatabaseUrl(),max:2,connectionTimeoutMillis:5000,statement_timeout:10000,idleTimeoutMillis:10000,application_name:'perplex-jobs-dev'});
 return drizzle(pool,{schema});
}
export async function closeWorkerDatabase(){await pool?.end();pool=undefined;}
