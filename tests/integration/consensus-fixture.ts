import {providers} from './deep-fixture';
import {createLocalSafetyGuard} from '@/server/safety/local';
import type {ConsensusProvider} from '@/server/deep-research/consensus-provider';
export function consensusProviders(){
 const p=providers();for(const key of ['input','query','evidence','output'] as const)p[key]=createLocalSafetyGuard();
 const plan=p.planner.plan;p.planner.plan=async(...args)=>{const result=await plan(...args);return args[0].previous.length?result:{...result,value:{...result.value as object,action:'RESEARCH',questions:[],brief:{objective:'Compare database storage and synchronization.',constraints:[],assumptions:['BALANCED_COMPARISON']}}};};
 const consensus:ConsensusProvider={usage:()=>({costMicroUsd:100n,inputTokens:1,outputTokens:1,actualModel:'fixture'}),
  candidate:async()=>({claims:[{text:'SQLite stores data locally.',support:[{sourceId:'S1',quote:'SQLite stores data locally.'}]}],limitations:['This evidence does not benchmark performance.']}),
  judge:async()=>({judgments:['A1','B1','C1'].map(claimId=>({claimId,verdict:'SUPPORTED',reason:'The passage explicitly describes local storage.',support:[{sourceId:'S1',quote:'SQLite stores data locally.'}]})),sections:[[{text:'SQLite stores data locally.',claimIds:['A1']}],[{text:'Local storage can be distinguished from the documented client server architecture.',claimIds:['B1']}],[{text:'The passage describes local storage but does not establish comparative performance.',claimIds:['C1']}]]}),
 };
 return {...p,consensus};
}
