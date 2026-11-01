import {maintainBilling} from '../src/server/payments/maintenance';
import {config} from 'dotenv';
import {setTimeout as delay} from 'node:timers/promises';
import {workerDatabase,closeWorkerDatabase,workerBudgetKey} from '../src/server/jobs/connection';
import {consumeJob,dispatchJobs} from '../src/server/jobs/consumer';
config({path:'.env.jobs.local',quiet:true});
const controller=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
const db=workerDatabase(),budgetKey=workerBudgetKey();let lastBilling=0;
try{
 do{
  try{await dispatchJobs(db,async claim=>{await consumeJob(db,claim.jobId,{signal:controller.signal,budgetKey});},1,budgetKey);if(Date.now()-lastBilling>60000){lastBilling=Date.now();try{await maintainBilling(db);}catch{console.warn(JSON.stringify({event:"billing.maintenance",outcome:"UNAVAILABLE"}));}}}
  catch{if(!controller.signal.aborted)console.error(JSON.stringify({event:'jobs.worker',outcome:'UNAVAILABLE'}));}
  if(process.argv.includes('--once'))break;
  await delay(1000,undefined,{signal:controller.signal}).catch(()=>{});
 }while(!controller.signal.aborted);
}finally{await closeWorkerDatabase();}
