import type {JobDatabase} from './store';
import type {DispatchClaim} from './admission';
import {dispatchJobs} from './consumer';
export type JobTransport={watch:(claim:DispatchClaim)=>Promise<void>;execute:(claim:DispatchClaim)=>Promise<void>};
// A watchdog must be accepted before execution. Stable keys make uncertain
// acknowledgements safe to redeliver; DB claims independently fence execution.
export async function maintainJobDispatch(db:JobDatabase,budgetKey:string,transport:JobTransport,strict=false,dispatchEnabled=true){
 return dispatchJobs(db,async claim=>{await transport.watch(claim);await transport.execute(claim);},10,budgetKey,strict,dispatchEnabled);
}
