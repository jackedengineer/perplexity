import {config} from 'dotenv';
import {setTimeout as delay} from 'node:timers/promises';
import {workerDatabase,closeWorkerDatabase} from '../src/server/jobs/connection';
import {consumeJob,dispatchJobs} from '../src/server/jobs/consumer';
config({path:'.env.local',quiet:true});
const controller=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
const db=workerDatabase();
try{
 do{
  try{await dispatchJobs(db,async claim=>{await consumeJob(db,claim.jobId,{signal:controller.signal});},1);}
  catch{if(!controller.signal.aborted)console.error(JSON.stringify({event:'jobs.worker',outcome:'UNAVAILABLE'}));}
  if(process.argv.includes('--once'))break;
  await delay(1000,undefined,{signal:controller.signal}).catch(()=>{});
 }while(!controller.signal.aborted);
}finally{await closeWorkerDatabase();}
