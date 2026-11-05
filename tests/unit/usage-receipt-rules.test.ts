import {expect,it} from 'vitest';
// @ts-expect-error Plain ESM helper without type declarations.
import {receiptMatchesCall} from '../../scripts/usage-receipt-rules.mjs';
const call=(change:Record<string,unknown>={})=>({cap_micro_usd:'12500',cost_micro_usd:null,call_status:'UNKNOWN',run_status:'FAILED',...change});
it('accepts a receipt within the cap for an ambiguous call',()=>{
 expect(receiptMatchesCall(call(),'0')).toBe(true);expect(receiptMatchesCall(call(),'12500')).toBe(true);
 expect(receiptMatchesCall(call({call_status:'SUCCEEDED'}),'8000')).toBe(true);
 expect(receiptMatchesCall(call({cost_micro_usd:'100'}),'100')).toBe(true);expect(receiptMatchesCall(call({cost_micro_usd:'100',call_status:'STARTED'}),'900')).toBe(true);
});
it('rejects a receipt above the cap, below reported usage or on an active run',()=>{
 expect(receiptMatchesCall(call(),'12501')).toBe(false);expect(receiptMatchesCall(call({cost_micro_usd:'100'}),'99')).toBe(false);
 for(const run_status of ['RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT'])expect(receiptMatchesCall(call({run_status}),'0')).toBe(false);
});
it('holds a call with a final reported cost to exactly that cost, because no hold covers an increase',()=>{
 const priced=call({cost_micro_usd:'1000',call_status:'SUCCEEDED',run_status:'COMPLETED'});
 expect(receiptMatchesCall(priced,'1000')).toBe(true);expect(receiptMatchesCall(priced,'3000')).toBe(false);expect(receiptMatchesCall(priced,'999')).toBe(false);
});
