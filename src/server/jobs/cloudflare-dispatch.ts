import {claimDispatch,finishDispatch} from './admission';
import {recoverJobs} from './worker';
import type {JobDatabase} from './store';
// One claim per scheduled invocation. The platform has already accepted this
// invocation, so delivery can be acknowledged before the potentially long work.
// A crash in that gap remains a QUEUED/DELIVERED job for the existing reaper.
export async function dispatchCloudflareJob(db:JobDatabase,budgetKey:string,consume:(id:string)=>Promise<unknown>,enabled=true){
 await recoverJobs(db,20,budgetKey);
 if(!enabled)return 'PAUSED' as const;
 const claim=await claimDispatch(db,budgetKey);if(!claim)return 'IDLE' as const;
 if(!await finishDispatch(db,claim,true))return 'STALE' as const;
 await consume(claim.jobId);
 return 'EXECUTED' as const;
}
