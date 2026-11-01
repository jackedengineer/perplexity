import {setTimeout as delay} from 'node:timers/promises';
import type {JobDatabase} from '@/server/jobs/store';
import {JobError} from '@/server/jobs/contracts';
import {claimJob,startStep,completeStep,completeJob,failJob,heartbeat} from '@/server/jobs/worker';
import {deepResearch} from './contracts';
import {loadResearch,researchExecutor} from './executor';
import type {DeepProviders} from './providers';
import {durableJobs} from '@/db/schema';
import {eq} from 'drizzle-orm';
export async function consumeResearch(db:JobDatabase,id:string,options:{signal?:AbortSignal;budgetKey?:string;providers?:DeepProviders}={}){
 const lease=await claimJob(db,id,options.budgetKey);if(!lease)return 'DUPLICATE' as const;
 const [job]=await db.select().from(durableJobs).where(eq(durableJobs.id,id));
 const controller=new AbortController(),stopHeartbeat=new AbortController();
 const signal=AbortSignal.any([controller.signal,...(options.signal?[options.signal]:[]),AbortSignal.timeout(Math.max(1,job.deadlineAt.getTime()-Date.now()))]);
 const pumping=(async()=>{while(!stopHeartbeat.signal.aborted){
  try{await delay(3000,undefined,{signal:stopHeartbeat.signal});await heartbeat(db,lease);}catch{if(!stopHeartbeat.signal.aborted)controller.abort();return;}
 }})();
 try{
  const execute=researchExecutor(db,id,await loadResearch(db,id),options.providers);
  for(const step of deepResearch.steps){
   if(signal.aborted)throw new JobError('STALE');
   if(await startStep(db,lease,step.key)==='DONE')continue;
   const result=await execute(step.key,{signal,deadlineAt:job.deadlineAt});
   if(signal.aborted)throw new JobError('STALE');
   await completeStep(db,lease,step.key,result.cost,result.value);
   if(result.stop){await failJob(db,lease);return 'FAILED' as const;}
  }
  await completeJob(db,lease);return 'COMPLETED' as const;
 }catch(error){
  if(error instanceof JobError&&error.code==='STALE')return 'STOPPED' as const;
  try{await failJob(db,lease);}catch{ /* Cancellation/expiry/recovery already owns settlement. */ }
  return 'FAILED' as const;
 }finally{stopHeartbeat.abort();controller.abort();await pumping;}
}
