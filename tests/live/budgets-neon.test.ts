import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {eq,inArray} from 'drizzle-orm';
import {afterAll,afterEach,beforeAll,expect,it} from 'vitest';
import * as schema from '@/db/schema';
import {createNeonFixture,simultaneously} from './admission-fixture';
import {createRequestLimiter,requestRateKey} from '@/server/runs/rate-limit';
import {createRunAdmission} from '@/server/runs/admit';
import {createProviderCalls} from '@/server/runs/provider-calls';
import {createRunRecovery} from '@/server/runs/recover';
import {createUsageReconciliation} from '@/server/runs/reconcile';
import {createChatHttp} from '@/server/chat/http';

const f=createNeonFixture(),keys:string[]=[];
const limits={userMinute:3,userDay:20,anonymousMinute:2,anonymousDay:10};
const limiter=()=>createRequestLimiter(f.runtime,f.namespace,limits);
const track=(subject:string|null)=>{keys.push(requestRateKey(subject,f.namespace));return subject;};
afterEach(async()=>{try{await f.cleanup();if(keys.length)await f.owner.delete(schema.requestRateBuckets).where(inArray(schema.requestRateBuckets.bucketKey,keys));}finally{keys.length=0;}});
afterAll(()=>f.close());
beforeAll(async()=>{
 const clients=await Promise.all(Array.from({length:4},()=>f.runtimePool.connect()));
 try{await Promise.all(clients.map(c=>c.query('BEGIN')));const pids=await Promise.all(clients.map(async c=>(await c.query('SELECT pg_backend_pid() AS id')).rows[0].id));expect(new Set(pids).size).toBe(4);}
 finally{await Promise.all(clients.map(async c=>{try{await c.query('ROLLBACK');}finally{c.release();}}));}
});
it('four independent connections cannot exceed the shared three-request allowance',async()=>{
 const p=await f.identity(),subject=track(p.subject);
 const results=await Promise.allSettled(Array.from({length:4},()=>createRequestLimiter(f.runtime,f.namespace,{...limits,userDay:3}).consume(subject)));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(3);
 expect(results.filter(r=>r.status==='rejected')).toMatchObject([{reason:{code:'RATE_LIMITED'}}]);
 const rows=await f.owner.select().from(schema.requestRateBuckets).where(eq(schema.requestRateBuckets.bucketKey,requestRateKey(subject,f.namespace)));
 expect(rows.filter(r=>r.kind==='MINUTE').every(r=>r.attempts<=3)).toBe(true);expect(rows.filter(r=>r.kind==='DAY').reduce((n,r)=>n+r.attempts,0)).toBe(3);
},60000);
it('anonymous submission denials share bounded counters without client-selected identities',async()=>{
 track(null);const results=await Promise.allSettled(Array.from({length:4},()=>createRequestLimiter(f.runtime,f.namespace,{...limits,anonymousDay:2}).consume(null)));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
 const rows=await f.owner.select().from(schema.requestRateBuckets).where(eq(schema.requestRateBuckets.bucketKey,requestRateKey(null,f.namespace)));expect(rows.filter(r=>r.kind==='DAY').reduce((n,r)=>n+r.attempts,0)).toBe(2);
},60000);
it('malformed HTTP submissions consume durable abuse allocation without admission or raw content',async()=>{
 const p=await f.identity(),subject=track(p.subject);let backendCalls=0;
 const http=createChatHttp({identity:async()=>({user:{id:subject!},sessionId:randomUUID()}),origin:()=> 'http://localhost:3000',consumeRequest:s=>createRequestLimiter(f.runtime,f.namespace,{...limits,userMinute:2}).consume(s),
  backend:()=>{backendCalls++;throw new Error('Unexpected admission');},load:async()=>{throw new Error('Unexpected load');},log:()=>{}});
 const responses=[];for(let i=0;i<3;i++)responses.push(await http.post(new Request('http://localhost:3000/api/chat',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json','x-forwarded-for':'attacker-controlled'},body:JSON.stringify({private:'RAW_REJECTED_PROMPT',userId:randomUUID()})})));
 expect(responses.map(r=>r.status)).toEqual([422,422,429]);expect(backendCalls).toBe(0);
 const rows=await f.owner.select().from(schema.requestRateBuckets).where(eq(schema.requestRateBuckets.bucketKey,requestRateKey(subject,f.namespace)));
 expect(rows.find(r=>r.kind==='DAY')?.attempts).toBe(3);expect(JSON.stringify(rows)).not.toContain('RAW_REJECTED_PROMPT');
},60000);
it('concurrent quota denials retain new-intent attempt counts without any holds',async()=>{
 const p=await f.identity();await f.budgets();await f.owner.update(schema.usageBuckets).set({creditLimit:0}).where(eq(schema.usageBuckets.userId,p.profile.id));
 const admission=createRunAdmission(f.runtime,f.keys,{...f.policy,attemptsPerMinute:3,attemptsPerDay:3});
 const outcomes=await simultaneously(Array.from({length:2},()=>()=>admission.admit(p.subject,{...p.request,clientRequestId:randomUUID()})));
 for(let i=0;i<2;i++)outcomes.push(await admission.admit(p.subject,{...p.request,clientRequestId:randomUUID()}));
 expect(outcomes.filter(r=>r.kind==='DENIED'&&r.code==='BUDGET_EXCEEDED')).toHaveLength(3);
 expect(outcomes).toContainEqual({kind:'DENIED',code:'RATE_LIMITED'});
 expect(await f.owner.select().from(schema.runs).where(eq(schema.runs.userId,p.profile.id))).toHaveLength(0);
 expect((await f.owner.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,p.profile.id))).every(b=>b.reservedCredits===0&&b.reservedProviderMicroUsd===0n)).toBe(true);
},60000);
it('expired retries retain the deadline and unknown hold; late usage reconciles once',async()=>{
 const p=await f.identity();await f.budgets();const admitted=await f.admission.admit(p.subject,p.request);if(admitted.kind!=='ADMITTED')throw new Error('Synthetic admission failed');
 await f.owner.update(schema.runs).set({status:'CHECKING_INPUT'}).where(eq(schema.runs.id,admitted.run.id));
 const calls=createProviderCalls(f.runtime,p.subject,admitted.run.id),claim=await calls.begin('INPUT_SAFETY','test/safety');
 const expired=new Date(Date.now()-1000);await f.owner.update(schema.runs).set({createdAt:new Date(Date.now()-120000),deadlineAt:expired}).where(eq(schema.runs.id,admitted.run.id));
 await createRunRecovery(f.runtime).sweep(undefined,f.namespace);
 expect(await f.admission.admit(p.subject,p.request)).toMatchObject({kind:'RUN_ALREADY_FINISHED',run:{deadlineAt:expired.toISOString()}});
 await expect(calls.begin('INPUT_SAFETY','test/new-timeout')).rejects.toMatchObject({code:'DEADLINE_EXCEEDED'});
 expect((await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,admitted.run.id)))[0].heldProviderMicroUsd).toBe(50000n);
 await calls.finish(claim.id,'SUCCEEDED',{costMicroUsd:300n,inputTokens:10,outputTokens:5,actualModel:'test/safety'});
 await Promise.allSettled(Array.from({length:4},()=>createUsageReconciliation(f.runtime).reconcile(p.subject,admitted.run.id)));
 expect(await f.owner.select().from(schema.runReconciliations).where(eq(schema.runReconciliations.runId,admitted.run.id))).toHaveLength(1);
 expect((await f.owner.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,p.profile.id))).every(b=>b.reservedProviderMicroUsd===0n&&b.settledProviderMicroUsd===300n&&b.settledCredits===0)).toBe(true);
},60000);
it('runtime can increment counts but cannot move windows or delete counter history',async()=>{
 const p=await f.identity();track(p.subject);await limiter().consume(p.subject);const where=eq(schema.requestRateBuckets.bucketKey,requestRateKey(p.subject,f.namespace));
 await expect(f.runtime.update(schema.requestRateBuckets).set({startsAt:new Date()}).where(where)).rejects.toMatchObject({cause:{code:'42501'}});
 await expect(f.runtime.delete(schema.requestRateBuckets).where(where)).rejects.toMatchObject({cause:{code:'42501'}});
},60000);
it('measures a small contended burst without adding another coordination service',async()=>{
 const p=await f.identity(),subject=track(p.subject),samples:number[]=[];const rate=createRequestLimiter(f.runtime,f.namespace,{...limits,userMinute:100,userDay:1000}),started=performance.now();
 for(let batch=0;batch<5;batch++)await Promise.all(Array.from({length:4},async()=>{const start=performance.now();await rate.consume(subject);samples.push(Math.round(performance.now()-start));}));
 samples.sort((a,b)=>a-b);const report={conditions:'Development Neon; restricted runtime; concurrency 4; one contended subject; no providers',samples:samples.length,concurrency:4,p50Ms:samples[9],p95Ms:samples[18],maxMs:samples[19],durationMs:Math.round(performance.now()-started)};
 await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/t19-neon-load.json',JSON.stringify(report,null,2));console.log(JSON.stringify({event:'t19.neon_load',...report}));
 const rows=await f.owner.select().from(schema.requestRateBuckets).where(eq(schema.requestRateBuckets.bucketKey,requestRateKey(subject,f.namespace)));for(const kind of ['MINUTE','DAY'])expect(rows.filter(r=>r.kind===kind).reduce((n,r)=>n+r.attempts,0)).toBe(20);
},60000);

it('a real advisory-lock timeout is infrastructure failure and cannot roll back the abuse allocation',async()=>{
 const p=await f.identity(),subject=track(p.subject);await f.budgets();const blocker=await f.ownerPool.connect(),logs:unknown[]=[];
 const http=createChatHttp({identity:async()=>({user:{id:p.subject},sessionId:randomUUID()}),origin:()=> 'http://localhost:3000',consumeRequest:s=>limiter().consume(s),
  backend:()=>({admit:f.admission.admit,execute:async()=>{throw new Error('Unexpected execution');},load:async()=>{throw new Error('Unexpected load');}}),load:async()=>{throw new Error('Unexpected load');},log:e=>logs.push(e)});
 try{
  await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',['run-admission:'+p.profile.id]);
  const response=await http.post(new Request('http://localhost:3000/api/chat',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify(p.request)}));
  expect(response.status).toBe(503);expect((await response.json()).error.code).toBe('CONFIGURATION_UNAVAILABLE');
  expect(logs).toEqual([expect.objectContaining({category:'infrastructure',outcome:'CONFIGURATION_UNAVAILABLE'})]);expect(JSON.stringify(logs)).not.toContain('run-admission:');
  expect((await f.owner.select().from(schema.requestRateBuckets).where(eq(schema.requestRateBuckets.bucketKey,requestRateKey(subject,f.namespace)))).every(r=>r.attempts===1)).toBe(true);
  expect(await f.owner.select().from(schema.runs).where(eq(schema.runs.userId,p.profile.id))).toHaveLength(0);
 }finally{await blocker.query('ROLLBACK');blocker.release();}
},60000);
