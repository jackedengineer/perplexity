import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';
import {jobConfiguration} from './configuration';
export {sandboxDatabaseUrl,workerBudgetKey} from './configuration';
let pool:Pool|undefined;
export function workerDatabase(){
 if(!pool){const config=jobConfiguration();pool=new Pool({connectionString:config.databaseUrl,max:2,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:10000,idleTimeoutMillis:10000,keepAlive:true,keepAliveInitialDelayMillis:10000,application_name:config.mode==='LIVE'?'perplex-jobs-live':'perplex-jobs-dev'});
  pool.on('error',()=>console.warn(JSON.stringify({event:'jobs.database_pool',outcome:'UNAVAILABLE'})));
 }
 return drizzle(pool,{schema});
}
export async function closeWorkerDatabase(){await pool?.end();pool=undefined;}
