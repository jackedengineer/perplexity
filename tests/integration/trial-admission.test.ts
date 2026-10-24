import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq,sql } from 'drizzle-orm';
import { afterAll,beforeAll,expect,it } from 'vitest';
import * as schema from '@/db/schema';
import { createRunAdmission } from '@/server/runs/admit';
import { FREE_ADMISSION_POLICY } from '@/server/runs/policy';
import { createFinalization } from '@/server/runs/finalize';
import { createAnswerCompletion } from '@/server/runs/complete';
import { linkGuest } from '@/server/billing/link-guest';
import { readUsage } from '@/server/billing/usage';
import { keys,prepareCompletion,completionSession,fakeSafety,knownUsage } from '../helpers/completion';
const pg=new PGlite(),db=drizzle(pg,{schema});
beforeAll(async()=>{const j=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const e of j.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,'utf8'));});
afterAll(()=>pg.close());
async function fixture(guest=true) {
 const subject=randomUUID(),namespace=randomUUID();
 await db.insert(schema.user).values({id:subject,name:'Trial tester',email:`${subject}@example.test`,isAnonymous:guest,emailVerified:!guest});
 const [owner]=await db.insert(schema.appUsers).values({authSubject:subject}).returning();
 const [conversation]=await db.insert(schema.conversations).values({userId:owner.id,creationRequestId:randomUUID(),creationFingerprint:'trial',title:'Rainbows'}).returning();
 await db.insert(schema.operatorUsageBuckets).values((['PERIOD','DAY'] as const).map(kind=>({kind,budgetKey:namespace,startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+86400000),providerLimitMicroUsd:1000000n})));
 const admission=createRunAdmission(db,keys,{...FREE_ADMISSION_POLICY,operatorBudgetKey:namespace},undefined,true);
 const request={conversationId:conversation.id,clientRequestId:randomUUID(),expectedRevision:0,mode:'FAST',modelKey:'economy-nano',message:{text:'Why do rainbows form?'}};
 return {subject,owner,conversation,admission,request};
}
it('denies guest standard models and arbitrary model IDs before allocating credits',async()=>{
 const p=await fixture();
 expect(await p.admission.admit(p.subject,{...p.request,modelKey:'fast-default'})).toEqual({kind:'DENIED',code:'INVALID_INPUT'});
 await expect(p.admission.admit(p.subject,{...p.request,modelKey:'openai/gpt-5'})).rejects.toMatchObject({code:'INVALID_INPUT'});
 expect(await db.select().from(schema.usageReservations).where(eq(schema.usageReservations.userId,p.owner.id))).toEqual([]);
});
it('reserves economy credits once under concurrent replay and releases them on failure',async()=>{
 const p=await fixture();
 const results=await Promise.all([p.admission.admit(p.subject,p.request),p.admission.admit(p.subject,p.request)]);
 expect(results.map(r=>r.kind).sort()).toEqual(['ADMITTED','RUN_IN_PROGRESS']);
 const [run]=await db.select().from(schema.runs).where(eq(schema.runs.userId,p.owner.id));
 expect(run).toMatchObject({answerCredits:2,catalogVersion:'trials-v1',priceVersion:'credits-v1',providerReserveMicroUsd:50000n});
 expect((await readUsage(db,p.subject)).period).toMatchObject({limit:6,reserved:2,remaining:4});
 await createFinalization(db).fail(p.subject,run.id,'PROVIDER_UNAVAILABLE');
 expect((await readUsage(db,p.subject)).period).toMatchObject({reserved:0,used:0,remaining:6});
});
it('preserves spent guest credits when linking into an existing free account',async()=>{
 const p=await fixture(),target=await fixture(false);
 const admitted=await p.admission.admit(p.subject,p.request);expect(admitted.kind).toBe('ADMITTED');if(admitted.kind!=='ADMITTED')return;
 const person={...p,runId:admitted.run.id};
 await prepareCompletion(db,person);
 const {sessionId}=await completionSession(db,p.subject);
 const complete=await createAnswerCompletion(db,{answer:{modelId:'test/answer',generate:async()=>({text:'Water refracts sunlight [S1].',usage:knownUsage})},output:fakeSafety()}).complete(p.subject,sessionId,admitted.run.id,new AbortController().signal);
 expect(complete.kind).toBe('COMMITTED');
 await readUsage(db,target.subject);
 await db.update(schema.usageBuckets).set({settledCredits:4}).where(eq(schema.usageBuckets.userId,target.owner.id));
 await linkGuest(db,p.subject,target.subject);await linkGuest(db,p.subject,target.subject);
 expect((await readUsage(db,target.subject)).period).toMatchObject({limit:40,used:6,remaining:34});
 expect((await readUsage(db,target.subject)).day).toMatchObject({limit:20,used:6,remaining:14});
 // Budget checks include linked spend, even though historical receipts remain separate.
 await db.update(schema.usageBuckets).set({settledCredits:19}).where(sql`${schema.usageBuckets.userId}=${target.owner.id} AND ${schema.usageBuckets.retiredAt} IS NULL`);
 expect(await target.admission.admit(target.subject,target.request)).toEqual({kind:'DENIED',code:'BUDGET_EXCEEDED'});
});
it('does not renew an expired lifetime guest grant',async()=>{
 const p=await fixture();await readUsage(db,p.subject);
 await db.update(schema.user).set({createdAt:new Date(Date.now()-31*86400000)}).where(eq(schema.user.id,p.subject));
 await expect(readUsage(db,p.subject)).rejects.toThrow();
 expect(await db.select().from(schema.creditGrants).where(eq(schema.creditGrants.userId,p.owner.id))).toHaveLength(1);
});
