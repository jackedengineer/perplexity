import {randomUUID} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {recordSafetyProvider,recordSearchProvider} from '@/server/runs/provider-calls';
afterEach(()=>vi.useRealTimers());
function ledger(){return {begin:vi.fn(async()=>({id:randomUUID(),deadlineAt:new Date(Date.now()+45000),remainingMs:100,observedAt:performance.now()})),finish:vi.fn(async()=>{})};}
it('preserves a classifier stage expiry as TIMEOUT while the run still has time',async()=>{
 vi.useFakeTimers();
 const calls=ledger(),provider=recordSafetyProvider(calls,'INPUT_SAFETY',{modelId:'test/safety',classify:(_input,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('PRIVATE')),{once:true}))});
 const pending=provider.classify({text:'Synthetic',context:[]},new AbortController().signal);
 const captured=pending.catch(error=>error);
 await vi.advanceTimersByTimeAsync(100);expect(await captured).toMatchObject({reason:'TIMEOUT'});
 expect(calls.finish).toHaveBeenCalledWith(expect.any(String),'UNKNOWN',undefined);
});
it('caller cancellation during search is not reported as deadline expiry',async()=>{
 const incoming=new AbortController(),calls=ledger();
 const provider=recordSearchProvider(calls,{search:async()=>{incoming.abort();throw new Error('PRIVATE');}});
 await expect(provider.search('Synthetic',{signal:incoming.signal,deadlineAt:new Date(Date.now()+45000)})).rejects.toMatchObject({code:'CONFLICT'});
});
