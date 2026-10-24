// All visible answers share one read slot. Do not cache results across owners,
// and start each network timeout only when its slot becomes available.
let pending:Promise<unknown>=Promise.resolve();
export function queueFeedbackRead<T>(work:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
 const next=pending.then(()=>{signal?.throwIfAborted();return work();});
 pending=next.catch(()=>undefined);
 return next;
}
