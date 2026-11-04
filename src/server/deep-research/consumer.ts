import {setTimeout as delay} from 'node:timers/promises';
import type {JobDatabase} from '@/server/jobs/store';
import {JobError} from '@/server/jobs/contracts';
import {claimJob,startStep,completeStep,completeJob,failJob,heartbeat} from '@/server/jobs/worker';
import {readCheckpoint,checkpointStops} from './checkpoints';
import {manifestFor} from '@/server/jobs/contracts';
import {loadResearch,researchExecutor} from './executor';
import {createDeepProviders,type DeepProviders} from './providers';
import {durableJobs} from '@/db/schema';
import {eq} from 'drizzle-orm';
import type {JobEnvironment} from '@/server/jobs/configuration';
export async function consumeResearch(db:JobDatabase,id:string,options:{signal?:AbortSignal;budgetKey?:string;providers?:DeepProviders;environment?:JobEnvironment;providerEnvironment?:Record<string,string|undefined>}={}){
 let currentStep='configuration';
 const lease=await claimJob(db,id,options.budgetKey,options.environment);if(!lease)return 'DUPLICATE' as const;
 const [job]=await db.select().from(durableJobs).where(eq(durableJobs.id,id));
 const controller=new AbortController(),stopHeartbeat=new AbortController();
 const signal=AbortSignal.any([controller.signal,...(options.signal?[options.signal]:[]),AbortSignal.timeout(Math.max(1,job.deadlineAt.getTime()-Date.now()))]);
 const pumping=(async()=>{while(!stopHeartbeat.signal.aborted){
  try{await delay(3000,undefined,{signal:stopHeartbeat.signal});await heartbeat(db,lease);}catch{if(!stopHeartbeat.signal.aborted)controller.abort();return;}
 }})();
 try{
  const snapshot=await loadResearch(db,id);
  const providers=options.providers??createDeepProviders(snapshot,options.providerEnvironment);
  const execute=researchExecutor(db,id,snapshot,providers);
  for(const step of manifestFor(snapshot.version).steps){
   if(signal.aborted)throw new JobError('STALE');
   if(await startStep(db,lease,step.key)==='DONE'){
    if(checkpointStops(await readCheckpoint(db,id,step.key))){await failJob(db,lease);return 'FAILED' as const;}
    continue;
   }
   currentStep=step.key;const started=performance.now();
   const result=await execute(step.key,{signal,deadlineAt:job.deadlineAt});
   if(signal.aborted)throw new JobError('STALE');
   await completeStep(db,lease,step.key,result.cost,result.value,!!result.stop);
   console.info(JSON.stringify({event:'jobs.step',jobId:id,step:step.key,outcome:result.stop?'DENIED':'SUCCEEDED',costMicroUsd:result.cost.toString(),durationMs:Math.round(performance.now()-started)}));
   if(result.stop)return 'FAILED' as const;
  }
  await completeJob(db,lease);return 'COMPLETED' as const;
 }catch(error){
  console.warn(JSON.stringify({event:'jobs.step',jobId:id,step:currentStep,outcome:error instanceof JobError&&error.code==='STALE'?'STOPPED':'UNAVAILABLE'}));
  if(error instanceof JobError&&error.code==='STALE')return 'STOPPED' as const;
  try{await failJob(db,lease);}catch{ /* Cancellation/expiry/recovery already owns settlement. */ }
  return 'FAILED' as const;
 }finally{stopHeartbeat.abort();controller.abort();await pumping;}
}
