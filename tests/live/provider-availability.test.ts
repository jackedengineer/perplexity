import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {safetyRouteConfig} from './safety-route-config';
import {createOpenRouterSafetyProvider} from '@/server/safety/openrouter';
import {createInputGate} from '@/server/safety/input';
import {assertApprovedKeyCap} from '../../evals/key-budget';
import {loadCorpus} from '../../evals/report';
import {INPUT_SAFETY_PROMPT} from '@/server/safety/prompt';
import {EVIDENCE_SAFETY_PROMPT} from '@/server/safety/evidence';
import {OUTPUT_SAFETY_PROMPT} from '@/server/safety/output';
import {SAFETY_PROMPT_VERSIONS} from '@/server/safety/versions';
it('records one bounded provider availability probe without retries or raw upstream errors',async()=>{
 if(process.env.LIVE_PROVIDER_DIAGNOSTIC!=='1')throw Error('Explicit paid diagnostic opt-in required');
 const config=await safetyRouteConfig();
 const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:`Bearer ${config.apiKey}`},signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('Cap metadata unavailable');const {data}=await r.json();assertApprovedKeyCap(data,.01);
 const responses:Array<{status:number;code:unknown;category:string}>=[];let calls=0;
 const request:typeof fetch=async(url,init)=>{
  if(++calls>1||String(url)!=='https://openrouter.ai/api/v1/chat/completions')throw Error('Diagnostic envelope exhausted');
  const response=await fetch(url,init),body=await response.clone().json();
  const message=String(body.error?.message??'');
  responses.push({status:response.status,code:typeof body.error?.code==='number'?body.error.code:null,
   category:/rate/i.test(message)?'RATE_LIMIT':/credit|balance/i.test(message)?'CREDIT':/endpoint|provider/i.test(message)?'ROUTE':response.ok?'SUCCESS':'OTHER'});
  return response;
 };
 const fixture=(await loadCorpus()).safety.filter(c=>c.test==='SEMANTIC').find(c=>c.id===process.env.LIVE_PROVIDER_DIAGNOSTIC_CASE);
 if(process.env.LIVE_PROVIDER_DIAGNOSTIC_CASE&&!fixture)throw Error('Unknown diagnostic case');
 const prompt=fixture?.stage==='OUTPUT'?OUTPUT_SAFETY_PROMPT:fixture?.stage==='EVIDENCE'?EVIDENCE_SAFETY_PROMPT:INPUT_SAFETY_PROMPT;
 const verdict=await createInputGate(createOpenRouterSafetyProvider(config,request,prompt)).evaluate({text:fixture?.text??'Why do rainbows form?',context:fixture?.context??[]},{signal:AbortSignal.timeout(5000),deadlineAt:new Date(Date.now()+5000)});
 const categories=verdict.verdict.decision==='BLOCK'?verdict.verdict.categoryCodes:[];
 // Keep every attempt, including failed candidates; a later probe cannot erase it.
 const evidence=`.artifacts/p0-provider-diagnostic-${randomUUID()}.json`;
 await writeFile(evidence,JSON.stringify({model:config.modelId,provider:config.provider,
  fixture:fixture?.id??null,promptVersions:SAFETY_PROMPT_VERSIONS,
  responses,decision:verdict.verdict.decision,categories,calls,claimMicroUsd:2250},null,2),{mode:0o600,flag:'wx'});
 console.info(`Provider diagnostic evidence: ${evidence}`);
 expect(verdict.verdict.decision).toBe(fixture?.expected??'ALLOW');
 if(fixture)expect(categories).toEqual(expect.arrayContaining(fixture.categories));
},20000);
