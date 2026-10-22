import {randomUUID} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {eq} from 'drizzle-orm';
import {afterAll,afterEach,expect,it,vi} from 'vitest';
import * as schema from '@/db/schema';
import {createNeonFixture,simultaneously} from './admission-fixture';
import {completionSession,prepareCompletion,fakeSafety,knownUsage} from '../helpers/completion';
import {createRunRecovery} from '@/server/runs/recover';
import {createUsageReconciliation} from '@/server/runs/reconcile';
import {createProviderCalls} from '@/server/runs/provider-calls';
import {createAnswerCompletion} from '@/server/runs/complete';
const f=createNeonFixture();afterEach(()=>f.cleanup());afterAll(()=>f.close());
async function seed(){const person=await f.identity();await f.budgets();const admitted=await f.admission.admit(person.subject,person.request);if(admitted.kind!=='ADMITTED')throw new Error('Synthetic admission failed');return {...person,runId:admitted.run.id,...await completionSession(f.owner,person.subject)};}
const identity=(p:Awaited<ReturnType<typeof seed>>)=>({user:{id:p.subject},sessionId:p.sessionId});
it('concurrent cancellation through independent connections settles once',async()=>{
 const p=await seed(),service=createRunRecovery(f.runtime);
 await Promise.allSettled(Array.from({length:4},()=>service.cancel(identity(p),p.runId)));
 await service.cancel(identity(p),p.runId);
 expect((await f.owner.select().from(schema.runs).where(eq(schema.runs.id,p.runId)))[0]).toMatchObject({status:'CANCELLED',attemptVersion:2});
 expect(await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,p.runId))).toHaveLength(1);
 expect((await f.owner.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,p.profile.id))).every(b=>b.reservedCredits===0&&b.reservedProviderMicroUsd===0n)).toBe(true);
},60000);
it('overlapping reapers recover a killed handler without releasing unknown cost',async()=>{
 const p=await seed();await f.owner.update(schema.runs).set({status:'CHECKING_INPUT'}).where(eq(schema.runs.id,p.runId));
 await createProviderCalls(f.runtime,p.subject,p.runId).begin('INPUT_SAFETY','test/safety');
 await f.owner.update(schema.runs).set({createdAt:new Date(Date.now()-120000),deadlineAt:new Date(Date.now()-60000)}).where(eq(schema.runs.id,p.runId));
 const results=await simultaneously(Array.from({length:4},()=>()=>createRunRecovery(f.runtime).sweep(undefined,f.namespace)));
 expect(results.reduce((n,r)=>n+r.recovered,0)).toBe(1);
 expect((await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,p.runId)))[0]).toMatchObject({creditsCharged:0,heldProviderMicroUsd:50000n});
 expect((await f.owner.select().from(schema.runs).where(eq(schema.runs.id,p.runId)))[0]).toMatchObject({status:'TIMED_OUT',attemptVersion:2});
},60000);
it('cancellation wins against a paused answer, then concurrent reconciliation debits its late cost once',async()=>{
 const p=await seed();await prepareCompletion(f.runtime,p,f.keys);let release!:()=>void;
 const answer={modelId:'test/answer',generate:()=>new Promise<{text:string;usage:typeof knownUsage}>(resolve=>{release=()=>resolve({text:'PRIVATE_LATE_DRAFT [S1].',usage:knownUsage});})};
 const pending=createAnswerCompletion(f.runtime,{answer,output:fakeSafety()}).complete(p.subject,p.sessionId,p.runId,new AbortController().signal);
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'),{timeout:15000});
 await createRunRecovery(f.runtime).cancel(identity(p),p.runId);release();expect((await pending).kind).toBe('DENIED');
 const [search]=await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,p.runId)).then(rows=>rows.filter(r=>r.stage==='SEARCH'));
 await f.owner.insert(schema.providerUsageResolutions).values({callId:search.id,runId:p.runId,costMicroUsd:8000n,kind:'PROVIDER_RECEIPT',evidenceHash:'c'.repeat(64)});
 await Promise.allSettled(Array.from({length:4},()=>createUsageReconciliation(f.runtime).reconcile(p.subject,p.runId)));
 await createUsageReconciliation(f.runtime).reconcile(p.subject,p.runId);
 expect(await f.owner.select().from(schema.runReconciliations).where(eq(schema.runReconciliations.runId,p.runId))).toHaveLength(1);
 expect((await f.owner.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,p.profile.id))).every(b=>b.settledProviderMicroUsd===8400n&&b.reservedProviderMicroUsd===0n&&b.settledCredits===0)).toBe(true);
 expect((await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,p.conversation.id))).map(m=>m.role)).toEqual(['USER']);
},90000);
it('runtime cannot manufacture provider evidence or mutate adjustment history',async()=>{
 const p=await seed();await f.owner.update(schema.runs).set({status:'CHECKING_INPUT'}).where(eq(schema.runs.id,p.runId));const callId=await createProviderCalls(f.runtime,p.subject,p.runId).begin('INPUT_SAFETY','test/safety');
 await createRunRecovery(f.runtime).cancel(identity(p),p.runId);
 await expect(f.runtime.insert(schema.providerUsageResolutions).values({callId,runId:p.runId,costMicroUsd:0n,kind:'VERIFIED_NOT_BILLED',evidenceHash:'d'.repeat(64)})).rejects.toMatchObject({cause:{code:'42501'}});
 await expect(f.runtime.delete(schema.runReconciliations).where(eq(schema.runReconciliations.runId,p.runId))).rejects.toMatchObject({cause:{code:'42501'}});
},60000);
it('the privileged CLI records an identical synthetic receipt idempotently and rejects a changed one',async()=>{
 const p=await seed();await f.owner.update(schema.runs).set({status:'CHECKING_INPUT'}).where(eq(schema.runs.id,p.runId));const callId=await createProviderCalls(f.runtime,p.subject,p.runId).begin('INPUT_SAFETY','test/safety');await createRunRecovery(f.runtime).cancel(identity(p),p.runId);
 const file=`.artifacts/t18-synthetic-receipt-${randomUUID()}.json`,receipt={callId,runId:p.runId,costMicroUsd:'300',kind:'PROVIDER_RECEIPT',evidenceHash:'e'.repeat(64)};
 const command=()=>promisify(execFile)(process.execPath,['scripts/record-usage-resolution.mjs','--receipt',file,'--verified-receipt'],{env:{...process.env,PERPLEX_DB_ENV_FILE:'.env.local',PERPLEX_DB_EXPECTED_HOST:new URL(process.env.DATABASE_URL_DIRECT!).hostname}});
 try{await writeFile(file,JSON.stringify(receipt),{mode:0o600});await command();await command();await writeFile(file,JSON.stringify({...receipt,costMicroUsd:'301'}));await expect(command()).rejects.toThrow();expect(await createUsageReconciliation(f.runtime).sweep(undefined,f.namespace)).toEqual({scanned:1,reconciled:1,failed:0});expect(await createUsageReconciliation(f.runtime).reconcile(p.subject,p.runId)).toBe('UNCHANGED');}
 finally{await unlink(file);}
},60000);
