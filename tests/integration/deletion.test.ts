import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import * as schema from '@/db/schema';
import {createConversationRepository} from '@/server/conversations/repository';
import {createConversationPrivacy} from '@/server/conversations/privacy';
import {createRunAdmission} from '@/server/runs/admit';
import {FREE_ADMISSION_POLICY} from '@/server/runs/policy';
import {createMessageAcceptance} from '@/server/runs/accept-message';
import {createInputGate} from '@/server/safety/input';
import {seedCompletion,prepareCompletion,keys,fakeSafety} from '../helpers/completion';
const pg=new PGlite(),db=drizzle(pg,{schema}),repository=createConversationRepository(db);
beforeAll(async()=>{
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 for(const entry of journal.entries)await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));
});
afterAll(()=>pg.close());
it('keeps foreign and missing IDs indistinguishable and never deletes their content',async()=>{
 const p=await seedCompletion(db),privacy=createConversationPrivacy(db);
 for(const id of [p.conversation.id,randomUUID()])await expect(privacy.remove('stranger',id)).rejects.toMatchObject({code:'NOT_FOUND'});
 expect((await repository.get(p.subject,p.conversation.id)).title).toBe('Synthetic completion');
});
it('fences an in-flight run, scrubs content, preserves unknown cost holds, and is idempotent',async()=>{
 const p=await seedCompletion(db);await prepareCompletion(db,p);
 await db.insert(schema.providerCalls).values({runId:p.runId,stage:'ANSWER',attemptVersion:1,requestedModel:'test/answer',capMicroUsd:20000n,status:'STARTED',startedAt:new Date()});
 const privacy=createConversationPrivacy(db);
 await privacy.remove(p.subject,p.conversation.id);await privacy.remove(p.subject,p.conversation.id);
 const [run]=await db.select().from(schema.runs).where(eq(schema.runs.id,p.runId));
 expect(run).toMatchObject({status:'CANCELLED',attemptVersion:2});
 const [receipt]=await db.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,p.runId));
 expect(receipt.creditsCharged).toBe(0);expect(receipt.heldProviderMicroUsd).toBeGreaterThan(0n);
 for(const table of [schema.messages,schema.inputSafetyReviews,schema.outputReviews,schema.runPlans,schema.runRetrievals,schema.runSources,schema.sourcePassages])expect(await db.select().from(table)).toEqual([]);
 await expect(repository.get(p.subject,p.conversation.id)).rejects.toMatchObject({code:'NOT_FOUND'});
 expect((await repository.list(p.subject,{limit:20,q:''})).items).toEqual([]);
 expect(await createRunAdmission(db,keys,{...FREE_ADMISSION_POLICY,operatorBudgetKey:p.operatorBudgetKey}).admit(p.subject,p.request)).toEqual({kind:'DENIED',code:'NOT_FOUND'});
 const accepted=await createMessageAcceptance(db,keys,createInputGate(fakeSafety())).accept(p.subject,p.runId,p.request,new AbortController().signal);
 expect(accepted.kind).not.toBe('ACCEPTED');
 expect(await db.select().from(schema.messages)).toEqual([]);
});
it('cannot replay creation to reveal a deleted title',async()=>{
 const p=await seedCompletion(db);const input={title:'Private title',clientRequestId:randomUUID()};
 const created=await repository.create(p.subject,input);
 await createConversationPrivacy(db).remove(p.subject,created.conversation.id);
 await expect(repository.create(p.subject,input)).rejects.toMatchObject({code:'NOT_FOUND'});
});
it('exports only approved owner history, never drafts or provider internals',async()=>{
 const p=await seedCompletion(db);await prepareCompletion(db,p);
 await db.insert(schema.messages).values({conversationId:p.conversation.id,role:'ASSISTANT',kind:'ANSWER',sequence:2,parts:[{type:'text',text:'PRIVATE_DRAFT'}]});
 const exported=await repository.exportData(p.subject,p.conversation.id);
 expect(exported.messages).toHaveLength(1);
 expect(exported.messages[0].parts[0].text).toBe('Why do rainbows form?');
 expect(JSON.stringify(exported)).not.toMatch(/PRIVATE_DRAFT|authSubject|payloadHmac|providerReserve/);
 await expect(repository.exportData('stranger',p.conversation.id)).rejects.toMatchObject({code:'NOT_FOUND'});
});
