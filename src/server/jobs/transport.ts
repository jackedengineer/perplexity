import {tasks} from '@trigger.dev/sdk';
import type {DispatchClaim} from './admission';
import {maintainJobDispatch} from './dispatch';
import type {JobDatabase} from './store';
const delivery={idempotencyKeyTTL:'24h' as const,maxAttempts:1};
export function jobTransport(){return {
 watch:async(claim:DispatchClaim)=>{await tasks.trigger('watch-job-v1',{jobId:claim.jobId},{...delivery,delay:'45s',idempotencyKey:claim.key+':watch'},{retry:{maxAttempts:1}});},
 execute:async(claim:DispatchClaim)=>{await tasks.trigger('execute-job-v1',{jobId:claim.jobId},{...delivery,idempotencyKey:claim.key},{retry:{maxAttempts:1}});},
 };}
export function automaticDispatch(db:JobDatabase,budgetKey:string){return maintainJobDispatch(db,budgetKey,jobTransport());}
export async function kickJobs(id:string){
 // Acceleration only. A failed kick never rolls back accepted work; independently
 // scheduled maintenance/supervised dispatch still drains the durable outbox.
 await tasks.trigger('maintain-jobs-v1',{}, {...delivery,idempotencyKey:'job-kick:'+id},{retry:{maxAttempts:1}});
}
