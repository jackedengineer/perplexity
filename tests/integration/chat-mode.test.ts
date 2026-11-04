import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import * as schema from '@/db/schema';
import {seedCompletion,completionSession,fakePlanner,fakeSafety,knownUsage,keys} from '../helpers/completion';
import {createRunExecution,type ExecutionProviders} from '@/server/runs/execute';
import {createRunAdmission} from '@/server/runs/admit';
import {createAnswerDelivery} from '@/server/chat/delivery';
import {FREE_ADMISSION_POLICY} from '@/server/runs/policy';
import {submissionSchema} from '@/server/contracts/chat';
const pg=new PGlite(),db=drizzle(pg,{schema});
let person:Awaited<ReturnType<typeof seedCompletion>>,identity:{user:{id:string};sessionId:string};
beforeAll(async()=>{const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const e of journal.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,'utf8'));});
beforeEach(async()=>{await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);person=await seedCompletion(db,50000n,'Write a short poem about rain.',2,undefined,'CHAT');identity={user:{id:person.subject},sessionId:(await completionSession(db,person.subject)).sessionId};});
afterAll(()=>pg.close());
function providers():ExecutionProviders{return {planner:fakePlanner(),input:fakeSafety(),query:fakeSafety(),evidence:fakeSafety(),output:fakeSafety(),answer:{modelId:'test/answer',generate:vi.fn().mockResolvedValue({text:'Rain taps softly on the leaves.',usage:knownUsage})},search:{search:vi.fn().mockRejectedValue(Error('Chat must never search'))}};}
async function run(p:ExecutionProviders,signal=new AbortController().signal){
 const input=submissionSchema.parse({...person.request,mode:'CHAT'}),admission=createRunAdmission(db,keys,{...FREE_ADMISSION_POLICY,operatorBudgetKey:person.operatorBudgetKey});
 const admitted=await admission.admit(person.subject,input);if(admitted.kind==='DENIED')throw Error(admitted.code);
 const stages:string[]=[];
 const result=await createRunExecution(db,keys,p).execute(identity,admitted.run,input,signal,s=>stages.push(s));
 return {result,stages,input,admission};
}
it('Chat skips planning/search, approves output, charges once and survives canonical reload',async()=>{
 const p=providers(),{result,stages,input,admission}=await run(p);
 expect(result).toEqual({kind:'COMPLETED'});expect(stages).toEqual(['PREPARING_ANSWER','CHECKING_ANSWER','SAVING_ANSWER']);
 expect(p.search.search).not.toHaveBeenCalled();
 expect(await db.select().from(schema.runPlans)).toHaveLength(0);expect(await db.select().from(schema.runRetrievals)).toHaveLength(0);
 const calls=await db.select().from(schema.providerCalls);expect(calls.map(c=>c.stage).sort()).toEqual(['ANSWER','INPUT_SAFETY','OUTPUT_SAFETY']);
 expect((await db.select().from(schema.runSettlements))[0]).toMatchObject({creditsCharged:5,knownProviderMicroUsd:300n,heldProviderMicroUsd:0n});
 const delivery=createAnswerDelivery(db),saved=await delivery.load(identity,person.runId);
 expect(saved).toMatchObject({state:'COMPLETED',answer:{answer:{kind:'CHAT',sources:[]},text:'Rain taps softly on the leaves.'}});
 expect((await admission.admit(person.subject,input)).kind).toBe('RUN_ALREADY_FINISHED');
 expect(await admission.admit(person.subject,{...input,mode:'FAST'})).toEqual({kind:'DENIED',code:'IDEMPOTENCY_MISMATCH'});
 await expect(delivery.load({...identity,user:{id:'other'}},person.runId)).rejects.toMatchObject({code:'NOT_FOUND'});
});
it('blocks unsafe Chat input before answer calls',async()=>{
 const p=providers();p.input={...fakeSafety(),classify:async()=>({decision:'BLOCK',categoryCodes:['FRAUD'],policyVersion:'v1'})};
 expect((await run(p)).result).toMatchObject({code:'INPUT_BLOCKED'});expect(p.answer.generate).not.toHaveBeenCalled();
});
it('withholds blocked output and preserves paid usage',async()=>{
 const p=providers();p.output={...fakeSafety(),classify:async()=>({decision:'BLOCK',categoryCodes:['FRAUD'],policyVersion:'v1'})};
 expect((await run(p)).result).toMatchObject({code:'OUTPUT_BLOCKED'});
 expect((await db.select().from(schema.outputReviews))[0]).toMatchObject({guardVersion:'legacy-classifier-v1',decision:'BLOCK'});
 expect((await createAnswerDelivery(db).load(identity,person.runId)).answer).toBeUndefined();
 expect((await db.select().from(schema.runSettlements))[0]).toMatchObject({creditsCharged:0,knownProviderMicroUsd:300n});
});
it('cancellation fences Chat output and refunds user credits',async()=>{
 const p=providers(),controller=new AbortController();p.answer={generate:async()=>{controller.abort();throw Error();}};
 expect((await run(p,controller.signal)).result.kind).toBe('DENIED');
 expect((await db.select().from(schema.runs))[0].status).toBe('CANCELLED');
 expect((await db.select().from(schema.outputReviews))[0].guardVersion).toBe('not-recorded');
 expect((await db.select().from(schema.runSettlements))[0].creditsCharged).toBe(0);
 expect(await db.select().from(schema.messageCitations)).toHaveLength(0);
});
it('does not fabricate citations in uncited Chat output',async()=>{
 const p=providers();p.answer={generate:async()=>({text:'An invented fact [S1].',usage:knownUsage})};
 expect((await run(p)).result.kind).toBe('DENIED');expect((await createAnswerDelivery(db).load(identity,person.runId)).answer).toBeUndefined();
});
it('revoked sessions cannot receive a Chat answer',async()=>{
 const p=providers();p.input={...fakeSafety(),classify:async()=>{await db.delete(schema.session).where(eq(schema.session.id,identity.sessionId));return {decision:'ALLOW',categoryCodes:[],policyVersion:'v1'};}};
 expect((await run(p)).result).toMatchObject({code:'UNAUTHENTICATED'});expect(p.answer.generate).not.toHaveBeenCalled();
});

import {createLocalSafetyGuard,LOCAL_GUARD_VERSION} from '@/server/safety/local';
import {ProviderRefusalError} from '@/server/ai/bounded';
function localProviders(){const p=providers();return {...p,input:createLocalSafetyGuard(),query:createLocalSafetyGuard(),evidence:createLocalSafetyGuard(),output:createLocalSafetyGuard()};}
it('local Chat records only the real answer call and an auditable local approval',async()=>{
 const p=localProviders();person.request.message.text='What is my name?';
 // The admission fingerprint is immutable; seed the exact reported question.
 await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);
 person=await seedCompletion(db,50000n,'What is my name?',2,undefined,'CHAT');identity={user:{id:person.subject},sessionId:(await completionSession(db,person.subject)).sessionId};
 p.answer.generate=vi.fn().mockResolvedValue({text:'You have not told me your name in this chat.',usage:knownUsage});
 expect((await run(p)).result).toEqual({kind:'COMPLETED'});
 expect((await db.select().from(schema.providerCalls)).map(c=>c.stage)).toEqual(['ANSWER']);
 expect((await db.select().from(schema.inputSafetyReviews))[0]).toMatchObject({reason:'LOCAL_CHECK',modelId:null,detectorVersion:LOCAL_GUARD_VERSION});
 expect((await db.select().from(schema.outputReviews))[0]).toMatchObject({guardVersion:LOCAL_GUARD_VERSION,decision:'ALLOW'});
 expect((await db.select().from(schema.runSettlements))[0]).toMatchObject({knownProviderMicroUsd:100n,heldProviderMicroUsd:0n});
});
it('local output checks still withhold leaked secrets and fabricated citations',async()=>{
 for(const text of ['sk-or-v1-'+'a'.repeat(64),'A fabricated source [S1].']){
  const p=localProviders();p.answer.generate=vi.fn().mockResolvedValue({text,usage:knownUsage});
  expect((await run(p)).result).toMatchObject({kind:'DENIED',code:'OUTPUT_BLOCKED'});
  expect((await db.select().from(schema.outputReviews))[0]).toMatchObject({guardVersion:LOCAL_GUARD_VERSION,decision:'BLOCK'});
  expect((await createAnswerDelivery(db).load(identity,person.runId)).answer).toBeUndefined();
  // A fresh isolated identity for the next distinct case, never replay a run.
  await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);
  person=await seedCompletion(db,50000n,'Hello',2,undefined,'CHAT');identity={user:{id:person.subject},sessionId:(await completionSession(db,person.subject)).sessionId};
 }
});
it('a native provider refusal is a policy result, not a classifier outage',async()=>{
 const p=localProviders();p.answer.generate=vi.fn().mockRejectedValue(new ProviderRefusalError());
 expect((await run(p)).result).toMatchObject({kind:'DENIED',code:'OUTPUT_BLOCKED'});
 expect(p.answer.generate).toHaveBeenCalledOnce();
 expect((await createAnswerDelivery(db).load(identity,person.runId)).answer).toBeUndefined();
 expect((await db.select().from(schema.runSettlements))[0]).toMatchObject({creditsCharged:0,heldProviderMicroUsd:50000n});
});
