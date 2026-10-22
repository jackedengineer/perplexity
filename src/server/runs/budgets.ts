// FAST has one claim per stage. These ceilings are server policy, never browser input.
export const STAGE_LIMITS=Object.freeze({
 INPUT_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),QUERY_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),
 SEARCH:Object.freeze({capMicroUsd:8000n,maxDurationMs:8000}),EVIDENCE_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),
 ANSWER:Object.freeze({capMicroUsd:20000n,maxDurationMs:12000}),OUTPUT_SAFETY:Object.freeze({capMicroUsd:5000n,maxDurationMs:5000}),
});
export type ProviderStage=keyof typeof STAGE_LIMITS;
export type ProviderClaim={id:string;deadlineAt:Date;remainingMs:number;observedAt:number};
export function providerDeadline(claim:Pick<ProviderClaim,'remainingMs'|'observedAt'>,incoming:AbortSignal) {
 const controller=new AbortController(),abort=()=>controller.abort();
 const remaining=claim.remainingMs-(performance.now()-claim.observedAt);
 if(incoming.aborted||!Number.isFinite(remaining)||remaining<=0)abort();
 incoming.addEventListener('abort',abort,{once:true});
 const timer=controller.signal.aborted?undefined:setTimeout(abort,remaining);
 timer?.unref?.();
 return {signal:controller.signal,stop(){clearTimeout(timer);incoming.removeEventListener('abort',abort);}};
}
