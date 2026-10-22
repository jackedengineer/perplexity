import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { beforeAll,beforeEach,afterAll,expect,it,vi } from 'vitest';
import * as schema from '@/db/schema';
import { seedCompletion,completionSession,prepareCompletion,fakeSafety,knownUsage } from '../helpers/completion';
import { createRunRecovery } from '@/server/runs/recover';
import { createAnswerCompletion } from '@/server/runs/complete';
import { createFinalization } from '@/server/runs/finalize';
const pg=new PGlite(),db=drizzle(pg,{schema});
let person:Awaited<ReturnType<typeof seedCompletion>>,sessionId:string;
beforeAll(async()=>{const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const e of journal.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,'utf8'));});
beforeEach(async()=>{await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);person=await seedCompletion(db);sessionId=(await completionSession(db,person.subject)).sessionId;});
afterAll(()=>pg.close());
it('durably cancels an owned run once and releases only known-unused reservation',async()=>{
 const recovery=createRunRecovery(db);
 await recovery.cancel({user:{id:person.subject},sessionId},person.runId);
 await recovery.cancel({user:{id:person.subject},sessionId},person.runId);
 const [run]=await db.select().from(schema.runs),receipts=await db.select().from(schema.runSettlements);
 expect(run).toMatchObject({status:'CANCELLED',attemptVersion:2});expect(receipts).toHaveLength(1);
 expect(receipts[0]).toMatchObject({creditsCharged:0,knownProviderMicroUsd:0n,heldProviderMicroUsd:0n,releasedProviderMicroUsd:50000n});
 expect((await db.select().from(schema.usageBuckets)).every(b=>b.reservedCredits===0&&b.reservedProviderMicroUsd===0n)).toBe(true);
 expect(await db.select().from(schema.messages)).toHaveLength(0);
});
it('rejects another owner and revoked session without altering the run',async()=>{
 const recovery=createRunRecovery(db);
 await expect(recovery.cancel({user:{id:'foreign'},sessionId},person.runId)).rejects.toThrow();
 await db.delete(schema.session).where(eq(schema.session.id,sessionId));
 await expect(recovery.cancel({user:{id:person.subject},sessionId},person.runId)).rejects.toThrow();
 expect((await db.select().from(schema.runs))[0].status).toBe('RECEIVED');
});
it('repairs an expired killed handler and preserves unknown provider cost',async()=>{
 await db.update(schema.runs).set({status:'CHECKING_INPUT',createdAt:new Date(Date.now()-120000),deadlineAt:new Date(Date.now()-60000)}).where(eq(schema.runs.id,person.runId));
 await db.insert(schema.providerCalls).values({runId:person.runId,stage:'INPUT_SAFETY',attemptVersion:1,requestedModel:'test/safety',capMicroUsd:5000n,status:'STARTED',startedAt:new Date(Date.now()-90000)});
 await createRunRecovery(db).sweep();await createRunRecovery(db).sweep();
 expect((await db.select().from(schema.runs))[0]).toMatchObject({status:'TIMED_OUT',attemptVersion:2});
 expect((await db.select().from(schema.runSettlements))[0]).toMatchObject({creditsCharged:0,heldProviderMicroUsd:50000n});
 expect((await db.select().from(schema.usageBuckets)).every(b=>b.reservedCredits===0&&b.reservedProviderMicroUsd===50000n)).toBe(true);
});

it('late completion after cancellation records usage but cannot commit or resettle',async()=>{
 await prepareCompletion(db,person);
 let release!:()=>void;
 const answer={modelId:'test/answer',generate:()=>new Promise<{text:string;usage:typeof knownUsage}>(resolve=>{release=()=>resolve({text:'Private late draft [S1].',usage:knownUsage});})};
 const pending=createAnswerCompletion(db,{answer,output:fakeSafety()}).complete(person.subject,sessionId,person.runId,new AbortController().signal);
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 await createRunRecovery(db).cancel({user:{id:person.subject},sessionId},person.runId);
 release();expect((await pending).kind).toBe('DENIED');
 expect((await db.select().from(schema.runs))[0]).toMatchObject({status:'CANCELLED',attemptVersion:2});
 expect(await db.select().from(schema.runSettlements)).toHaveLength(1);
 expect((await db.select().from(schema.messages)).map(m=>m.role)).toEqual(['USER']);
 expect((await db.select().from(schema.providerCalls).where(eq(schema.providerCalls.stage,'ANSWER')))[0].costMicroUsd).toBe(100n);
});
it('completed approved answers survive cancellation and reaping',async()=>{
 await prepareCompletion(db,person);
 const result=await createAnswerCompletion(db,{answer:{modelId:'test/answer',generate:async()=>({text:'Water refracts sunlight [S1].',usage:knownUsage})},output:fakeSafety()}).complete(person.subject,sessionId,person.runId,new AbortController().signal);
 expect(result.kind).toBe('COMMITTED');
 await createRunRecovery(db).cancel({user:{id:person.subject},sessionId},person.runId);
 await createRunRecovery(db).sweep();
 expect((await db.select().from(schema.runs))[0].status).toBe('COMPLETED');
 expect((await db.select().from(schema.runSettlements))[0].creditsCharged).toBe(5);
});
it('repairs an unsuccessful terminal run missing its settlement',async()=>{
 await db.update(schema.runs).set({status:'FAILED'}).where(eq(schema.runs.id,person.runId));
 expect(await createRunRecovery(db).sweep()).toMatchObject({recovered:1,failed:0});
 expect(await db.select().from(schema.runSettlements)).toHaveLength(1);
});
it('missing reservations remain an explicit failure without inventing a refund',async()=>{
 await db.delete(schema.usageReservations).where(eq(schema.usageReservations.runId,person.runId));
 await db.update(schema.runs).set({status:'FAILED'}).where(eq(schema.runs.id,person.runId));
 expect(await createRunRecovery(db).sweep()).toMatchObject({recovered:0,failed:1});
 expect(await db.select().from(schema.runSettlements)).toHaveLength(0);
 expect((await db.select().from(schema.usageBuckets))[0].reservedCredits).toBe(5);
});
it('stale finalization callbacks cannot change a recovered attempt',async()=>{
 await createRunRecovery(db).cancel({user:{id:person.subject},sessionId},person.runId);
 expect(await createFinalization(db).fail(person.subject,person.runId,'PROVIDER_UNAVAILABLE',{attemptVersion:1,revision:1})).toMatchObject({kind:'DENIED',code:'CONFLICT'});
 expect((await db.select().from(schema.runs))[0].status).toBe('CANCELLED');
});
