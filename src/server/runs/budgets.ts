// FAST has one claim per stage. These ceilings are server policy, never browser input.
export const STAGE_LIMITS=Object.freeze({
 PLANNER:Object.freeze({capMicroUsd:2000n,maxDurationMs:5000}),
 INPUT_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),QUERY_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),
 SEARCH:Object.freeze({capMicroUsd:8000n,maxDurationMs:8000}),EVIDENCE_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),
 ANSWER:Object.freeze({capMicroUsd:20000n,maxDurationMs:12000}),OUTPUT_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),
});
export type ProviderStage=keyof typeof STAGE_LIMITS;
export type ProviderClaim={id:string;deadlineAt:Date;remainingMs:number;observedAt:number};
export function providerDeadline(claim:Pick<ProviderClaim,'remainingMs'|'observedAt'>,incoming:AbortSignal) {
 const controller=new AbortController();
 let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
 const cancel=()=>{clearTimeout(timer);controller.abort();};
 const expire=()=>{expired=true;controller.abort();};
 const remaining=claim.remainingMs-(performance.now()-claim.observedAt);
 if(!Number.isFinite(remaining)||remaining<=0)expire();
 else if(incoming.aborted)cancel();
 else {timer=setTimeout(expire,remaining);timer.unref?.();}
 incoming.addEventListener('abort',cancel,{once:true});
 return {signal:controller.signal,get expired(){return expired;},stop(){clearTimeout(timer);incoming.removeEventListener('abort',cancel);}};
}
