// Settlement holds only what an unresolved call could still cost, so nothing covers an
// increase to a call whose final cost was already reported. Those receipts must agree.
export function receiptMatchesCall(call,costMicroUsd){
 const cost=BigInt(costMicroUsd),reported=call.cost_micro_usd===null?null:BigInt(call.cost_micro_usd);
 const terminal=!['RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT'].includes(call.run_status);
 const final=reported!==null&&!['STARTED','UNKNOWN'].includes(call.call_status);
 return terminal&&cost<=BigInt(call.cap_micro_usd)&&cost>=(reported??0n)&&(!final||cost===reported);
}
