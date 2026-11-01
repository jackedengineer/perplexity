import {config} from 'dotenv';
import {setTimeout as delay} from 'node:timers/promises';
import {automaticDispatch} from '../src/server/jobs/transport';
import {workerDatabase,workerBudgetKey,closeWorkerDatabase} from '../src/server/jobs/connection';
import {maintainBilling} from '../src/server/payments/maintenance';
config({path:'.env.jobs.local',quiet:true});
if(!process.env.TRIGGER_SECRET_KEY?.startsWith('tr_dev_'))throw new Error('Development Trigger key required');
const db=workerDatabase(),budgetKey=workerBudgetKey(),controller=new AbortController();let lastBilling=0;
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
try{do{
 try{
  const sent=await automaticDispatch(db,budgetKey);
  if(Date.now()-lastBilling>60000){lastBilling=Date.now();try{await maintainBilling(db);}catch{console.warn(JSON.stringify({event:'billing.maintenance',outcome:'UNAVAILABLE'}));}}
  if(sent)console.info(JSON.stringify({event:'jobs.dispatch',sent}));
 }catch{console.error(JSON.stringify({event:'jobs.dispatch',outcome:'UNAVAILABLE'}));}
 if(process.argv.includes('--once'))break;
 await delay(5000,undefined,{signal:controller.signal}).catch(()=>{});
}while(!controller.signal.aborted);}finally{await closeWorkerDatabase();}
