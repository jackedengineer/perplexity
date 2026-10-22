import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeAll,beforeEach,afterAll,expect,it } from "vitest";
import * as schema from "@/db/schema";
import { createProviderCalls } from "@/server/runs/provider-calls";
import { hashPassage } from "@/server/search/evidence";
import { seedCompletion,prepareCompletion,knownUsage } from "../helpers/completion";
const pg = new PGlite(),db = drizzle(pg,{ schema });
let person: Awaited<ReturnType<typeof seedCompletion>>;
beforeAll(async()=>{ const journal = JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));for (const e of journal.entries) await pg.exec(await readFile(`drizzle/${e.tag}.sql`,"utf8")); });
beforeEach(async()=>{ await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);person = await seedCompletion(db); });
afterAll(()=>pg.close());
it("records each completed provider stage once and leaves search monetary usage unknown",async()=>{
  await prepareCompletion(db,person);
  const calls = await db.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,person.runId));
  expect(calls).toHaveLength(4);expect(calls.every(c=>c.status === "SUCCEEDED")).toBe(true);
  expect(calls.find(c=>c.stage === "SEARCH")).toMatchObject({ searchCredits: 1,costMicroUsd: null });
  expect(calls.filter(c=>c.stage !== "SEARCH").every(c=>c.costMicroUsd === 100n)).toBe(true);
  const ledger = createProviderCalls(db,person.subject,person.runId);
  const {id} = await ledger.begin("ANSWER","test/answer");
  await expect(ledger.begin("ANSWER","test/answer")).rejects.toThrow();
  await ledger.finish(id,"SUCCEEDED",knownUsage);await expect(ledger.finish(id,"SUCCEEDED",knownUsage)).rejects.toThrow();
});
it("enforces ownership, phase and fixed stage caps before external work",async()=>{
  const foreign = createProviderCalls(db,"foreign",person.runId),ledger = createProviderCalls(db,person.subject,person.runId);
  await expect(foreign.begin("INPUT_SAFETY","test/safety")).rejects.toThrow();
  await expect(ledger.begin("ANSWER","test/answer")).rejects.toThrow();
  await expect(db.insert(schema.providerCalls).values({ runId: person.runId,stage: "UNKNOWN",attemptVersion: 1,requestedModel: "test/model",capMicroUsd: -1n,status: "STARTED",startedAt: new Date() })).rejects.toMatchObject({ cause: { code: "23514" } });
  await prepareCompletion(db,person);const {id} = await ledger.begin("ANSWER","test/answer");
  await expect(foreign.finish(id,"SUCCEEDED",knownUsage)).rejects.toThrow();
});
it("records paid outcomes after a fence changes without authorizing continuation",async()=>{
  await prepareCompletion(db,person);const ledger = createProviderCalls(db,person.subject,person.runId),{id} = await ledger.begin("ANSWER","test/answer");
  await db.update(schema.runs).set({ attemptVersion: 2,status: "CANCELLED" }).where(eq(schema.runs.id,person.runId));
  await ledger.finish(id,"UNKNOWN",knownUsage);
  expect((await db.select().from(schema.providerCalls).where(eq(schema.providerCalls.id,id)))[0]).toMatchObject({ status: "UNKNOWN",costMicroUsd: 100n });
});
it("database rejects unreviewed output metadata including SQL NULL edge cases",async()=>{
  for (const change of [{ bodyHash: null },{ payload: null },{ payloadHash: null }]) {
    await expect(db.insert(schema.outputReviews).values({ runId: person.runId,conversationId: person.conversation.id,attemptVersion: 1,decision: "ALLOW",policyVersion: "v1",messageId: randomUUID(),bodyHash: hashPassage("Approved [S1]."),payloadHash: "a".repeat(64),payload: { runId: person.runId,attemptVersion: 1,revision: 1,policyVersion: "v1",kind: "ANSWER",markdown: "Approved [S1].",sources: [] },createdAt: new Date(),...change })).rejects.toMatchObject({ cause: { code: "23514" } });
  }
  await expect(db.insert(schema.providerCalls).values({ runId: person.runId,stage: "ANSWER",attemptVersion: 1,requestedModel: "test/model",capMicroUsd: 20000n,status: "SUCCEEDED",startedAt: new Date(),finishedAt: null })).rejects.toMatchObject({ cause: { code: "23514" } });
});
it("a smaller admitted reservation cannot be expanded by later stages",async()=>{
  const other = await seedCompletion(db,30000n);
  await prepareCompletion(db,other);
  const calls = createProviderCalls(db,other.subject,other.runId);
  await expect(calls.begin("ANSWER","test/answer")).rejects.toThrow();
  const stored = await db.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,other.runId));
  expect(stored.some(c=>c.stage === "ANSWER")).toBe(false);
});
it("retains partial provider charges on failure without recording private diagnostics",async()=>{
  const { recordSafetyProvider } = await import("@/server/runs/provider-calls");
  await db.update(schema.runs).set({ status: "CHECKING_INPUT" }).where(eq(schema.runs.id,person.runId));
  const calls = createProviderCalls(db,person.subject,person.runId);
  const provider = recordSafetyProvider(calls,"INPUT_SAFETY",{ modelId: "test/safety",usage: ()=>knownUsage,
    classify: async()=>{ throw new Error("PRIVATE rejected question, key and upstream body"); } });
  await expect(provider.classify({ text: "Synthetic",context: [] },new AbortController().signal)).rejects.toThrow("Safety classifier unavailable");
  const records = await db.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,person.runId));
  expect(records[0]).toMatchObject({ status: "UNKNOWN",costMicroUsd: 100n });
  expect(JSON.stringify(records,(_key,value)=>typeof value === "bigint" ? String(value) : value)).not.toContain("PRIVATE");
});
it("old accounting snapshots do not silently start new paid work",async()=>{
  expect((await db.select().from(schema.runs).where(eq(schema.runs.id,person.runId)))[0].accountingVersion).toBe(1);
  await db.update(schema.runs).set({ accountingVersion: 0,status: "CHECKING_INPUT" }).where(eq(schema.runs.id,person.runId));
  const calls = createProviderCalls(db,person.subject,person.runId);
  await expect(calls.begin("INPUT_SAFETY","test/safety")).rejects.toThrow();
  expect(await db.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,person.runId))).toHaveLength(0);
});
it('claims only the remaining database deadline, rejects repeats explicitly and never extends it',async()=>{
 await db.update(schema.runs).set({status:'CHECKING_INPUT',deadlineAt:new Date(Date.now()+1500)}).where(eq(schema.runs.id,person.runId));
 const calls=createProviderCalls(db,person.subject,person.runId),claim=await calls.begin('INPUT_SAFETY','test/safety');
 expect(claim.remainingMs).toBeGreaterThan(0);expect(claim.remainingMs).toBeLessThanOrEqual(1500);
 expect(claim.deadlineAt.getTime()).toBeLessThanOrEqual(Date.now()+1500);
 await expect(calls.begin('INPUT_SAFETY','test/safety')).rejects.toMatchObject({code:'RUN_IN_PROGRESS'});
});
it('an expired stage cannot dispatch search even when a caller supplies a new timeout',async()=>{
 const {recordSearchProvider}=await import('@/server/runs/provider-calls');let searches=0;
 await db.update(schema.runs).set({status:'SEARCHING',createdAt:new Date(Date.now()-120000),deadlineAt:new Date(Date.now()-1000)}).where(eq(schema.runs.id,person.runId));
 const provider=recordSearchProvider(createProviderCalls(db,person.subject,person.runId),{search:async()=>{searches++;return {results:[],credits:1};}});
 await expect(provider.search('Synthetic',{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+45000)})).rejects.toMatchObject({code:'DEADLINE_EXCEEDED'});
 expect(searches).toBe(0);expect(await db.select().from(schema.providerCalls)).toHaveLength(0);
});
it('a fresh caller timeout cannot extend search, and its unknown charge stays held after expiry',async()=>{
 const {recordSearchProvider}=await import('@/server/runs/provider-calls');
 const {createFinalization}=await import('@/server/runs/finalize');
 const {createUsageReconciliation}=await import('@/server/runs/reconcile');
 await db.update(schema.runs).set({status:'SEARCHING',deadlineAt:new Date(Date.now()+1000)}).where(eq(schema.runs.id,person.runId));
 let aborted=false;
 const provider=recordSearchProvider(createProviderCalls(db,person.subject,person.runId),{search:async(_query,options)=>new Promise((_resolve,reject)=>{
  options.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('Synthetic timeout'));},{once:true});
 })});
 await expect(provider.search('Synthetic',{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+45000)})).rejects.toMatchObject({code:'DEADLINE_EXCEEDED'});
 expect(aborted).toBe(true);
 const [{id:callId}]=await db.select().from(schema.providerCalls);
 expect((await db.select().from(schema.providerCalls))[0]).toMatchObject({id:callId,status:'UNKNOWN',costMicroUsd:null});
 await createFinalization(db).fail(person.subject,person.runId,'DEADLINE_EXCEEDED');
 expect((await db.select().from(schema.runSettlements))[0].heldProviderMicroUsd).toBe(50000n);
 expect(await createUsageReconciliation(db).reconcile(person.subject,person.runId)).toBe('UNRESOLVED');
});
