import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';
import {jobMaintenanceConfiguration} from './configuration';
import {cloudflareProviderEnvironment} from './cloudflare-configuration';
import {shouldRunPaidTick,type PaidActivityStore} from './paid-activity';
import {dispatchCloudflareJob} from './cloudflare-dispatch';
import {consumeJob} from './consumer';
import {recordJobMaintenance,recoverWorkerServices} from './maintenance';
import {recoverJobs} from './worker';
import {pruneJobEvidence} from './privacy';
import {maintainBilling} from '@/server/payments/maintenance';
import {paymentConfiguration} from '@/server/payments/config';
import type {JobDatabase} from './store';
type Environment=Record<string,string|undefined>;
// No module-level sockets: each scheduled invocation owns and closes its pool.
export function openCloudflareJobDatabase(databaseUrl:string){
 const pool=new Pool({connectionString:databaseUrl,max:2,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:10000,idleTimeoutMillis:10000,application_name:'perplex-cloudflare-jobs'});
 pool.on('error',()=>console.warn(JSON.stringify({event:'jobs.database_pool',outcome:'UNAVAILABLE'})));
 return {db:drizzle(pool,{schema}) as JobDatabase,close:()=>pool.end()};
}
export async function runCloudflarePaidTick(env:Environment,activity:PaidActivityStore|undefined,force=false,open=openCloudflareJobDatabase){
 if(env.JOB_EXECUTION_BACKEND!=='cloudflare')throw new Error('Cloudflare job backend required');
 const config=jobMaintenanceConfiguration(env);
 if(!await shouldRunPaidTick(activity,config.budgetKey,force))return 'IDLE' as const;
 const connection=open(config.databaseUrl);
 const signal=AbortSignal.timeout(14*60000);
 try{
  // Recover financial obligations even when new admission/execution is paused.
  // Readiness is recorded only after actual maintenance and configuration checks.
  let providers:ReturnType<typeof cloudflareProviderEnvironment>|undefined;
  try{providers=cloudflareProviderEnvironment(env);}catch{/* Recovery stays available without paid inference keys. */}
  const paused=new Error('Paid execution paused');
  try{await recordJobMaintenance(connection.db,config.budgetKey,()=>recoverWorkerServices({
   dispatch:()=>recoverJobs(connection.db,20,config.budgetKey),
   billing:()=>maintainBilling(connection.db,env),cleanup:()=>pruneJobEvidence(connection.db),
   ready:()=>{if(!providers||config.mode==='LIVE'&&env.ENABLE_PRODUCTION_JOBS!=='true')throw paused;if(config.mode==='LIVE')paymentConfiguration(env);},
  }));}catch(error){if(error===paused)return 'PAUSED' as const;throw error;}
  return await dispatchCloudflareJob(connection.db,config.budgetKey,id=>consumeJob(connection.db,id,{budgetKey:config.budgetKey,environment:config.mode,providerEnvironment:providers,signal}));
 }finally{await connection.close();}
}
