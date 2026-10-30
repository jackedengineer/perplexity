// Maximum approved provider-key ceiling. Local per-run envelopes remain lower.
// Key rotation must separately account for retired-key usage in the release record.
export function assertApprovedKeyCap(data:{limit:unknown;limit_reset:unknown;limit_remaining:unknown},minimum:number) {
 if(typeof data.limit!=='number'||!Number.isFinite(data.limit)||data.limit<=0||data.limit>2||
  data.limit_reset!==null||typeof data.limit_remaining!=='number'||!Number.isFinite(data.limit_remaining)||
  data.limit_remaining<minimum||data.limit_remaining>data.limit)throw Error('Approved non-resetting key cap and headroom required');
 return data.limit;
}
