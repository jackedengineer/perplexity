import {durableJobs} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {consumeResearch} from '@/server/deep-research/consumer';
import {setTimeout as delay} from 'node:timers/promises';
import {executionCheck,jobId,JobError} from './contracts';
import {claimJob,heartbeat,startStep,completeStep,completeJob,recoverJobs} from './worker';
import {claimDispatch,finishDispatch,type DispatchClaim} from './admission';
import type {JobDatabase} from './store';
import type {JobEnvironment} from './configuration';
export async function consumeJob(db:JobDatabase,rawId:string,options:{stepMs?:number;signal?:AbortSignal;budgetKey?:string;environment?:JobEnvironment}={}){
 const id=jobId.parse(rawId);const [job]=await db.select({workflow:durableJobs.workflow}).from(durableJobs).where(eq(durableJobs.id,id));
 if(job?.workflow==='deep-research-v1')return consumeResearch(db,id,options);
 const lease=await claimJob(db,id,options.budgetKey,options.environment);if(!lease)return 'DUPLICATE' as const;
 try{
  for(const step of executionCheck.steps){
   if(await startStep(db,lease,step.key)==='DONE')continue;
   // This first executor is a pure, replay-safe system checkpoint. A separate
   // reviewed adapter is required before MODEL/SEARCH/BROWSER steps can run.
   const duration=Math.max(0,Math.min(5000,options.stepMs??3000));
   for(let elapsed=0;elapsed<duration;elapsed+=1000){
    await delay(Math.min(1000,duration-elapsed),undefined,{signal:options.signal});
    await heartbeat(db,lease);
   }
   await completeStep(db,lease,step.key,0n);
  }
  await completeJob(db,lease);return 'COMPLETED' as const;
 }catch(error){
  if(error instanceof JobError&&error.code==='STALE')return 'STOPPED' as const;
  // The process/signal may die before recording a receipt. Leave the lease for
  // the reaper instead of pretending a failed network call cost nothing.
  throw error;
 }
}
export async function dispatchJobs(db:JobDatabase,send:(claim:DispatchClaim)=>Promise<void>,limit=10,budgetKey?:string){
 await recoverJobs(db,20,budgetKey);let sent=0;
 for(let i=0;i<Math.min(20,Math.max(1,limit));i++){
  const claim=await claimDispatch(db,budgetKey);if(!claim)break;
  try{await send(claim);await finishDispatch(db,claim,true);sent++;}
  catch{await finishDispatch(db,claim,false);break;}
 }
 return sent;
}
