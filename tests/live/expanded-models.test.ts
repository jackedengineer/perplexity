import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {expect,it} from 'vitest';
import {z} from 'zod';
import {assertApprovedKeyCap} from '../../evals/key-budget';
import {MODEL_CATALOG,extendedAnswerBudget} from '@/server/ai/catalog';
import {createAnswerProvider} from '@/server/ai/answer';
import {createChatProvider} from '@/server/ai/chat-provider';
import {buildEvidence} from '@/server/search/evidence';
import {providerUsage} from '@/server/ai/usage';

it('verifies larger Chat and cited Web models within the existing non-resetting key cap',async()=>{
 if(process.env.LIVE_EXPANDED_MODELS!=='1')throw Error('Explicit paid opt-in required');
 const env=parse(await readFile('.env.launch.local','utf8'));
 const metadata=async()=>{
  const response=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:`Bearer ${env.OPENROUTER_API_KEY}`},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('Cannot verify cap');const {data}=await response.json();assertApprovedKeyCap(data,.20);
  return {limit:data.limit,usage:data.usage,remaining:data.limit_remaining,expiry:data.expires_at};
 };
 const before=await metadata(),observations:Array<Record<string,unknown>>=[],results:Array<Record<string,unknown>>=[];
 const ledgerPath='.artifacts/graphite/expanded-models-allowance.json';
 const ledger=z.strictObject({bookedMicroUsd:z.string().regex(/^\d+$/u)}).parse(JSON.parse(await readFile(ledgerPath,'utf8')));
 let booked=BigInt(ledger.bookedMicroUsd),known=0n,calls=0;
 const saveLedger=()=>writeFile(ledgerPath,JSON.stringify({bookedMicroUsd:String(booked)}),{mode:0o600});
 const request:typeof fetch=async(url,init)=>{
  if(String(url)!=='https://openrouter.ai/api/v1/chat/completions'||calls>=4||booked+48000n>400000n)throw Error('Local bounded envelope exhausted');
  booked+=48000n;await saveLedger();calls++;const started=performance.now();
  try{
   const response=await fetch(url,init),body=await response.clone().json();
   const usage=response.ok?providerUsage(body.usage,body.model):null;
   if(usage?.costMicroUsd!==null&&usage?.costMicroUsd!==undefined){booked+=usage.costMicroUsd-48000n;known+=usage.costMicroUsd;await saveLedger();}
   observations.push({status:response.status,ms:Math.round(performance.now()-started),model:body.model??null,errorCode:body.error?.code??null,errorMessage:body.error?.message?String(body.error.message).slice(0,300):null,costMicroUsd:usage?.costMicroUsd?.toString()??null});
   return response;
  }catch{observations.push({status:'NO_RECEIPT',ms:Math.round(performance.now()-started)});throw Error('Provider unavailable');}
 };
 try{
  for(const model of MODEL_CATALOG.filter(m=>extendedAnswerBudget(m.key)&&m.key!=='standard-qwen-max')){
   for(const mode of ['CHAT','WEB'] as const){
    const evidence=buildEvidence(crypto.randomUUID(),mode==='CHAT'?[]:[{title:'Authored rainfall fixture',url:'https://example.org/rainbows',content:'Rainbows form when sunlight enters water droplets, refracts, reflects internally and disperses into different colors.',score:.99}],new Date());
    const provider=(mode==='CHAT'?createChatProvider:createAnswerProvider)({apiKey:env.OPENROUTER_API_KEY,modelId:model.modelId,provider:model.provider},request,model.maxOutputTokens,12000,true);
    const started=performance.now();
    try{
     const answer=await provider.generate({question:'Why do rainbows form? Answer in two sentences.',evidence},{signal:AbortSignal.timeout(13000),deadlineAt:new Date(Date.now()+12000)});
     expect(answer.text.length).toBeGreaterThan(15);
     if(mode==='WEB')expect(answer.text).toContain('[S1]');
     expect(provider.usage?.()?.costMicroUsd).not.toBeNull();
     results.push({key:model.key,mode,result:'PASSED',ms:Math.round(performance.now()-started),costMicroUsd:provider.usage?.()?.costMicroUsd?.toString()});
    }catch{results.push({key:model.key,mode,result:'UNAVAILABLE',ms:Math.round(performance.now()-started)});}
   }
  }
  expect(results.map(r=>r.result)).toEqual(Array(4).fill('PASSED'));
 }finally{
  const after=await metadata();await writeFile('.artifacts/graphite/expanded-models-live.json',JSON.stringify({before,after,calls,localEnvelopeMicroUsd:'400000',bookedMicroUsd:String(booked),knownMicroUsd:String(known),observations,results,checkedAt:new Date().toISOString()},null,2),{mode:0o600});
 }
},100000);
