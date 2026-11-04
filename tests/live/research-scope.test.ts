import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {parse} from 'dotenv';
import {expect,it} from 'vitest';
import {createDeepPlanner} from '@/server/deep-research/planner';
import {CONSENSUS_MODELS} from '@/server/deep-research/consensus-models';
import {validateScope} from '@/server/deep-research/scope';
import {resolveResearchTime} from '@/server/deep-research/time';
import {researchSnapshot} from '@/server/deep-research/contracts';
import {LOCAL_GUARD_MODEL} from '@/server/safety/local';
import {providerUsage} from '@/server/ai/usage';
it('clarifies missing subjects, accepts broad questions and preserves supplied constraints',async()=>{
 if(process.env.LIVE_RESEARCH_SCOPE!=='1')throw Error('Explicit live scope opt-in required');
 const env=parse(readFileSync('.env.launch.local'));
 const check=async()=>{const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Key metadata unavailable');const {data:d}=await r.json();if(d.limit!==1||d.limit_reset!=='daily'||typeof d.limit_remaining!=='number'||d.limit_remaining<.036)throw Error('Existing cap and headroom required');return {limit:d.limit,reset:d.limit_reset,remaining:d.limit_remaining};};
 const before=await check();let calls=0,booked=0n;const results:unknown[]=[];
 const request:typeof fetch=async(url,init)=>{if(String(url)!=='https://openrouter.ai/api/v1/chat/completions'||++calls>3)throw Error('Scope envelope exhausted');booked+=12000n;const response=await fetch(url,init);if(response.ok){const body=await response.clone().json(),cost=providerUsage(body.usage,body.model).costMicroUsd;if(cost!==null)booked+=cost-12000n;}return response;};
 const planner=createDeepPlanner({...CONSENSUS_MODELS.candidates[2],apiKey:env.OPENROUTER_API_KEY},request);
 const samples=[{question:'Which one should I choose?',clarifications:[],action:'CLARIFY'},
  {question:'Explain the benefits and limitations of renewable energy.',clarifications:[],action:'RESEARCH'},
  {question:'Which database should I choose?',clarifications:[{question:'Which options and application?',answer:'SQLite versus PostgreSQL for an offline notes app in 2024. No cloud services.'}],action:'RESEARCH'}];
 try{for(const [index,sample] of samples.entries()){
  const snapshot=researchSnapshot.parse({version:'deep-research-v2',policy:'v2',question:sample.question,locale:'en',models:{safety:LOCAL_GUARD_MODEL,planner:CONSENSUS_MODELS.candidates[2],answer:CONSENSUS_MODELS.judge},consensus:{models:CONSENSUS_MODELS,time:resolveResearchTime([sample.question,...sample.clarifications.map(c=>c.answer)].join(' '),new Date())},clarifications:sample.clarifications,clarificationRounds:sample.clarifications.length?1:0});
  const started=performance.now(),result=await planner.plan({snapshot,previous:[]},{signal:AbortSignal.timeout(50000),deadlineAt:new Date(Date.now()+50000)}),scope=validateScope(result.value,sample);
  results.push({index,action:scope.action,expected:sample.action,costMicroUsd:String(result.cost),ms:Math.round(performance.now()-started),scope});
  expect(scope.action).toBe(sample.action);
  if(index===2){expect(scope.brief?.objective).toMatch(/SQLite/i);expect(scope.brief?.objective).toMatch(/PostgreSQL/i);expect(scope.queries.join(' ')).toContain('2024');expect(scope.brief?.constraints.some(c=>/cloud/i.test(c.quote)&&c.source==='answer-1')).toBe(true);}
 }}finally{mkdirSync('.artifacts/consensus',{recursive:true});writeFileSync('.artifacts/consensus/scope-live.json',JSON.stringify({before,after:await check(),calls,bookedMicroUsd:String(booked),results},null,2),{mode:0o600});}
},160000);
