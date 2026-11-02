import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';
import {jobConfiguration,jobMaintenanceConfiguration} from './configuration';
export {sandboxDatabaseUrl,workerBudgetKey} from './configuration';
let pool:Pool|undefined;
function database(config:ReturnType<typeof jobConfiguration>){
 if(!pool){pool=new Pool({connectionString:config.databaseUrl,max:2,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:10000,idleTimeoutMillis:10000,keepAlive:true,keepAliveInitialDelayMillis:10000,application_name:config.mode==='LIVE'?'perplex-jobs-live':'perplex-jobs-dev'});
  pool.on('error',()=>console.warn(JSON.stringify({event:'jobs.database_pool',outcome:'UNAVAILABLE'})));
 }
 return drizzle(pool,{schema});
}
export function workerDatabase(){return database(jobConfiguration());}
export function maintenanceDatabase(){return database(jobMaintenanceConfiguration());}
export async function closeWorkerDatabase(){await pool?.end();pool=undefined;}
