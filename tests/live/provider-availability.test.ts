import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {expect,it} from 'vitest';
import {parseSafetyModel} from '@/server/ai/models';
import {createOpenRouterSafetyProvider} from '@/server/safety/openrouter';
import {createInputGate} from '@/server/safety/input';
import {assertApprovedKeyCap} from '../../evals/key-budget';
import {loadCorpus} from '../../evals/report';
it('records one bounded provider availability probe without retries or raw upstream errors',async()=>{
 if(process.env.LIVE_PROVIDER_DIAGNOSTIC!=='1')throw Error('Explicit paid diagnostic opt-in required');
 const env=parse(await readFile('.env.launch.local','utf8')),config=parseSafetyModel(env);
 if(!config)throw Error('Configured safety role required');
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
 const fixture=(await loadCorpus()).safety.find(c=>c.id===process.env.LIVE_PROVIDER_DIAGNOSTIC_CASE);
 if(process.env.LIVE_PROVIDER_DIAGNOSTIC_CASE&&!fixture)throw Error('Unknown diagnostic case');
 const verdict=await createInputGate(createOpenRouterSafetyProvider(config,request)).evaluate({text:fixture?.text??'Why do rainbows form?',context:fixture?.context??[]},{signal:AbortSignal.timeout(5000),deadlineAt:new Date(Date.now()+5000)});
 await writeFile('.artifacts/p0-provider-diagnostic.json',JSON.stringify({responses,decision:verdict.verdict.decision,calls,claimMicroUsd:2250},null,2),{mode:0o600});
 expect(verdict.verdict.decision).toBe(fixture?.expected??'ALLOW');
},20000);
