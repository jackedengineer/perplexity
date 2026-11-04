import {expect,it} from 'vitest';
import {createConsensusProvider,consensusEvidence} from '@/server/deep-research/consensus-provider';
import {CONSENSUS_MODELS} from '@/server/deep-research/consensus-models';
import {resolveResearchTime} from '@/server/deep-research/time';
import {buildEvidence} from '@/server/search/evidence';
const evidence=buildEvidence(crypto.randomUUID(),[{title:'Record',url:'https://example.org',content:'The measured value is 42 units.',score:1}],new Date());
const input={question:'What is the value?',locale:'en',time:resolveResearchTime('What is the value?',new Date()),evidence};
const options=()=>({signal:AbortSignal.timeout(5000),deadlineAt:new Date(Date.now()+5000)});
it('pins routes, retention, price and output limits without tools or paid retries',async()=>{
 const calls:Record<string,unknown>[]=[];
 const request:typeof fetch=async(_url,init)=>{calls.push(JSON.parse(String(init?.body)));return Response.json({id:'fixture',object:'chat.completion',created:1,model:CONSENSUS_MODELS.candidates[0].modelId,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({claims:[{text:'Value is 42.',support:[{sourceId:'S1',quote:'The measured value is 42 units.'}]}],limitations:[]})}}],usage:{cost:.0001,prompt_tokens:100,completion_tokens:100,total_tokens:200}});};
 const p=createConsensusProvider(CONSENSUS_MODELS,'fixture',request);await p.candidate(0,input,options());
 expect(calls).toHaveLength(1);expect(calls[0].model).toBe(CONSENSUS_MODELS.candidates[0].modelId);
 expect(calls[0].provider).toMatchObject({only:['google-vertex/global'],allow_fallbacks:false,require_parameters:true,zdr:true,data_collection:'deny',max_price:{prompt:1,completion:5,request:0}});
 expect(calls[0].max_tokens).toBe(1800);expect(calls[0]).not.toHaveProperty('temperature');expect(p.usage()?.costMicroUsd).toBe(100n);
});
it('preserves a charged malformed response and clears it before the next failed call',async()=>{
 let calls=0;const p=createConsensusProvider(CONSENSUS_MODELS,'fixture',async()=>{calls++;if(calls===2)return new Response('',{status:503});return Response.json({usage:{cost:.0002},model:'fixture',choices:[]});});
 await expect(p.candidate(0,input,options())).rejects.toThrow();expect(p.usage()?.costMicroUsd).toBe(200n);
 await expect(p.candidate(1,input,options())).rejects.toThrow();expect(p.usage()).toBeUndefined();expect(calls).toBe(2);
});
it('uses a bounded common evidence set with only complete known passages',()=>{
 const selected=consensusEvidence(evidence);expect(selected.sources).toHaveLength(1);expect(selected.passages[0].text).toBe('The measured value is 42 units.');
 expect(()=>consensusEvidence({...evidence,passages:evidence.passages.map(p=>({...p,text:'a'.repeat(12000)}))})).toThrow();
});
