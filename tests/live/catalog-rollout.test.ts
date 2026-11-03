import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {parse} from 'dotenv';
import pg from 'pg';
import {expect,it} from 'vitest';
import {assertApprovedKeyCap} from '../../evals/key-budget';
import {MODEL_CATALOG} from '@/server/ai/catalog';
import {parseSafetyModel} from '@/server/ai/models';
import {createOpenRouterSafetyProvider} from '@/server/safety/openrouter';
import {createInputGate} from '@/server/safety/input';
import {createAnswerProvider} from '@/server/ai/answer';
import {createReleaseGate} from '@/server/safety/release';
import {OUTPUT_SAFETY_PROMPT} from '@/server/safety/output';
import {buildEvidence} from '@/server/search/evidence';
import {providerUsage} from '@/server/ai/usage';

// Manual acceptance only. Separate operator reservation protects concurrent app
// traffic; an interrupted process retains the full hold. No quota is increased.
it('accepts new catalog providers under an existing $0.05 operator reservation',async()=>{
 if(process.env.LIVE_CATALOG_ROLLOUT!=='1'||!process.env.LIVE_CATALOG_CONFIG_FILE)throw Error('Explicit paid opt-in and production configuration required');
 const env=JSON.parse(await readFile(process.env.LIVE_CATALOG_CONFIG_FILE,'utf8')) as Record<string,string>;
 const owner=parse(await readFile('.env.launch.local','utf8')),safety=parseSafetyModel(env);
 if(!safety||safety.apiKey!==owner.OPENROUTER_API_KEY)throw Error('Expected ordinary research key');
 const metadata=async()=>{
  const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:`Bearer ${safety.apiKey}`},signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('Key metadata unavailable');const {data}=await r.json();assertApprovedKeyCap(data,.05);
  if(!data.expires_at||Date.parse(data.expires_at)<=Date.now()+180000)throw Error('Key expiry too close');
  return {limit:data.limit,usage:data.usage,remaining:data.limit_remaining,expiresAt:data.expires_at};
 };
 const before=await metadata(),cap=50000n,receiptPath=`.artifacts/catalog-rollout-${randomUUID()}.json`;
 const db=new pg.Client({connectionString:owner.DATABASE_URL_DIRECT,connectionTimeoutMillis:8000,statement_timeout:8000});await db.connect();
 let ids:string[]=[],booked=0n,known=0n,unknown=0n,calls=0,reserved=false,settled=false;
 const observations:Array<Record<string,unknown>>=[],models:Array<Record<string,unknown>>=[];
 const save=()=>writeFile(receiptPath,JSON.stringify({before,capMicroUsd:String(cap),bucketIds:ids,reserved,settled,bookedMicroUsd:String(booked),knownMicroUsd:String(known),unknownMicroUsd:String(unknown),calls,observations,models},null,2),{mode:0o600});
 try{
  await db.query('BEGIN');
  const rows=(await db.query("SELECT id,kind,provider_limit_micro_usd-reserved_provider_micro_usd-settled_provider_micro_usd AS available FROM operator_usage_buckets WHERE budget_key='production-research-v1' AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp()+interval '3 minutes' ORDER BY id FOR UPDATE")).rows;
  if(rows.length!==2||new Set(rows.map(r=>r.kind)).size!==2||rows.some(r=>BigInt(r.available)<cap))throw Error('Existing operator headroom unavailable');
  ids=rows.map(r=>r.id);await db.query('UPDATE operator_usage_buckets SET reserved_provider_micro_usd=reserved_provider_micro_usd+$1 WHERE id=ANY($2::uuid[])',[String(cap),ids]);
  await db.query('COMMIT');reserved=true;await save();
  const request:typeof fetch=async(url,init)=>{
   const body=JSON.parse(String(init?.body)),claim=body.model===safety.modelId?2250n:12500n;
   if(String(url)!=='https://openrouter.ai/api/v1/chat/completions'||calls>=7||booked+claim>cap)throw Error('Probe spending envelope exhausted');
   expect(body.provider).toMatchObject({allow_fallbacks:false,require_parameters:true,data_collection:'deny',zdr:true});
   calls++;booked+=claim;let accounted=false;const started=performance.now();
   try{
    const response=await fetch(url,init),body=await response.clone().json();
    const usage=providerUsage(body.usage,body.model),message=String(body.error?.message??'');
    observations.push({model:body.model??null,status:response.status,ms:Math.round(performance.now()-started),category:response.ok?'SUCCESS':/rate/i.test(message)?'RATE_LIMIT':/endpoint|provider/i.test(message)?'ROUTE':'OTHER'});
    if(response.ok&&usage.costMicroUsd!==null){if(usage.costMicroUsd>claim)throw Error('Receipt exceeded claim');booked+=usage.costMicroUsd-claim;known+=usage.costMicroUsd;accounted=true;}
    return response;
   }finally{if(!accounted)unknown+=claim;await save();}
  };
  const options=()=>({signal:AbortSignal.timeout(15000),deadlineAt:new Date(Date.now()+15000)}),question='Why do rainbows form?';
  expect((await createInputGate(createOpenRouterSafetyProvider(safety,request)).evaluate({text:question,context:[]},options())).verdict.decision).toBe('ALLOW');
  const runId=randomUUID(),evidence=buildEvidence(runId,[{title:'Authored rainbow fixture',url:'https://example.org/rainbows',content:'Rainbows form when sunlight enters water droplets, refracts, reflects internally and disperses into different colors. The Sun is behind the observer and rain is in front.',score:.99}],new Date());
  for(const model of MODEL_CATALOG.filter(m=>['economy-qwen','economy-gemini','standard-deepseek'].includes(m.key))){
   const started=performance.now();
   try{
    const answer=createAnswerProvider({apiKey:safety.apiKey,modelId:model.modelId,provider:model.provider},request,model.maxOutputTokens);
    const draft=await answer.generate({question,evidence},options());
    const approved=await createReleaseGate(createOpenRouterSafetyProvider(safety,request,OUTPUT_SAFETY_PROMPT)).approve({runId,attemptVersion:1,revision:1,kind:'ANSWER',question,markdown:draft.text,evidence},options());
    models.push({key:model.key,model:model.modelId,provider:model.provider,result:approved.kind,ms:Math.round(performance.now()-started),costMicroUsd:answer.usage?.()?.costMicroUsd?.toString(),citations:approved.kind==='APPROVED'?approved.response.sources.length:0});
   }catch{models.push({key:model.key,model:model.modelId,provider:model.provider,result:'UNAVAILABLE',ms:Math.round(performance.now()-started)});}
   await save();
  }
 }finally{
  if(reserved){
   // Only this probe's unused reservation is released; unknown calls stay held.
   await db.query('BEGIN');await db.query('SELECT id FROM operator_usage_buckets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[ids]);
   await db.query('UPDATE operator_usage_buckets SET reserved_provider_micro_usd=reserved_provider_micro_usd-$1,settled_provider_micro_usd=settled_provider_micro_usd+$2 WHERE id=ANY($3::uuid[])',[String(cap-unknown),String(known),ids]);
   await db.query('COMMIT');settled=true;
  }else await db.query('ROLLBACK');
  await save();await db.end();console.info(receiptPath,JSON.stringify({models,knownMicroUsd:String(known),unknownMicroUsd:String(unknown)}));
 }
 expect(models).toHaveLength(3);
},150000);
