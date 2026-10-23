// FAST has one claim per stage. These ceilings are server policy, never browser input.
export const LEGACY_STAGE_LIMITS=Object.freeze({
 PLANNER:Object.freeze({capMicroUsd:2000n,maxDurationMs:5000}),
 INPUT_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),QUERY_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),
 SEARCH:Object.freeze({capMicroUsd:8000n,maxDurationMs:8000}),EVIDENCE_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),
 ANSWER:Object.freeze({capMicroUsd:20000n,maxDurationMs:12000}),OUTPUT_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),
});
// v2 adds independent fanout/extraction claims without raising the 50,000 reserve.
// Safety wire bytes are capped at 20k: .1/1M input + 384*.4/1M output < 2,250.
// Answer wire bytes are capped at 20k: .5/1M input + 1,200*2/1M output < 12,500.
export const STAGE_LIMITS=Object.freeze({
 PLANNER:Object.freeze({capMicroUsd:2000n,maxDurationMs:5000}),
 INPUT_SAFETY:Object.freeze({capMicroUsd:2250n,maxDurationMs:5000}),QUERY_SAFETY:Object.freeze({capMicroUsd:2250n,maxDurationMs:5000}),QUERY_SECOND:Object.freeze({capMicroUsd:2250n,maxDurationMs:5000}),
 SEARCH:Object.freeze({capMicroUsd:8000n,maxDurationMs:8000}),SEARCH_SECOND:Object.freeze({capMicroUsd:8000n,maxDurationMs:8000}),EXTRACT:Object.freeze({capMicroUsd:8000n,maxDurationMs:8000}),
 EVIDENCE_SAFETY:Object.freeze({capMicroUsd:2250n,maxDurationMs:5000}),ANSWER:Object.freeze({capMicroUsd:12500n,maxDurationMs:12000}),OUTPUT_SAFETY:Object.freeze({capMicroUsd:2250n,maxDurationMs:5000}),
});
export function stageLimits(version:number,stage:ProviderStage){
 if(version===2)return STAGE_LIMITS[stage];
 if(version===1&&stage in LEGACY_STAGE_LIMITS)return LEGACY_STAGE_LIMITS[stage as keyof typeof LEGACY_STAGE_LIMITS];
 return undefined;
}
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
