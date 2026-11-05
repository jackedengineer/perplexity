import {randomUUID} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {recordSafetyProvider,recordSearchProvider} from '@/server/runs/provider-calls';
import {PlanningError} from '@/server/ai/plan';
afterEach(()=>vi.useRealTimers());
function ledger(){return {begin:vi.fn(async()=>({id:randomUUID(),deadlineAt:new Date(Date.now()+45000),remainingMs:100,runLimited:false,observedAt:performance.now()})),finish:vi.fn(async()=>{})};}
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

import {recordPlannerProvider} from '@/server/runs/provider-calls';
const plannerInput=()=>({original:{id:randomUUID(),text:'Synthetic planner question'},context:[],now:new Date().toISOString(),timezone:'UTC',locale:'en'});
const hangs=(_input:unknown,{signal}:{signal:AbortSignal})=>new Promise<never>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('PRIVATE')),{once:true}));
it('reports planner stage expiry as a planning failure while the run has time, recording its unknown cost once',async()=>{
 vi.useFakeTimers();const calls=ledger();
 const provider=recordPlannerProvider(calls,{modelId:'test/planner',plan:hangs});
 const pending=provider.plan(plannerInput(),{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+45000)}).catch(error=>error);
 await vi.advanceTimersByTimeAsync(100);const error=await pending;
 expect(error).toBeInstanceOf(PlanningError);expect(error).toMatchObject({reason:'TIMEOUT'});expect(error.message).not.toContain('PRIVATE');
 expect(calls.begin).toHaveBeenCalledOnce();expect(calls.finish).toHaveBeenCalledExactlyOnceWith(expect.any(String),'UNKNOWN',undefined);
});
it('still reports a deadline when the planner limit ran into the end of the run',async()=>{
 vi.useFakeTimers();const calls=ledger();calls.begin.mockImplementation(async()=>({id:randomUUID(),deadlineAt:new Date(Date.now()+200),remainingMs:50,runLimited:true,observedAt:performance.now()}));
 const provider=recordPlannerProvider(calls,{modelId:'test/planner',plan:hangs});
 const pending=provider.plan(plannerInput(),{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+100)}).catch(error=>error);
 // The timer can fire before the wall clock reaches the deadline, because the claim's own time was deducted from it.
 await vi.advanceTimersByTimeAsync(50);expect(await pending).toMatchObject({code:'DEADLINE_EXCEEDED'});
});
it('records a rejected plan\'s reported cost as final, and an unreported cost as unknown',async()=>{
 const reported={costMicroUsd:65n,inputTokens:10,outputTokens:5,actualModel:'test/planner'};
 for(const [usage,status] of [[reported,'SUCCEEDED'],[undefined,'UNKNOWN'],[{...reported,costMicroUsd:null},'UNKNOWN']] as const){
  const calls=ledger(),provider=recordPlannerProvider(calls,{modelId:'test/planner',usage:()=>usage,plan:async()=>{throw new PlanningError('PLAN_VOCABULARY');}});
  await expect(provider.plan(plannerInput(),{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+45000)})).rejects.toMatchObject({reason:'PLAN_VOCABULARY'});
  expect(calls.finish).toHaveBeenCalledExactlyOnceWith(expect.any(String),status,usage);
 }
});
it('planner caller cancellation is distinct from a provider deadline',async()=>{
 const incoming=new AbortController(),calls=ledger();
 const provider=recordPlannerProvider(calls,{modelId:'test/planner',plan:async()=>{incoming.abort();throw new Error('PRIVATE');}});
 await expect(provider.plan({original:{id:randomUUID(),text:'Synthetic'},context:[],now:new Date().toISOString(),timezone:'UTC',locale:'en'},{signal:incoming.signal,deadlineAt:new Date(Date.now()+45000)})).rejects.toMatchObject({code:'CONFLICT'});
});
