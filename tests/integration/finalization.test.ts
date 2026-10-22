import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeAll,beforeEach,afterAll,expect,it,vi } from "vitest";
import * as schema from "@/db/schema";
import { seedCompletion,prepareCompletion,completionSession,fakeSafety,knownUsage } from "../helpers/completion";
import type { SafetyProvider } from "@/server/safety/provider";
import { createAnswerCompletion } from "@/server/runs/complete";
import { createFinalization } from "@/server/runs/finalize";
const pg = new PGlite(),db = drizzle(pg,{ schema });
let person: Awaited<ReturnType<typeof seedCompletion>>,sessionId: string;
const signal = () => new AbortController().signal;
const answer = () => ({ modelId: "test/answer",generate: vi.fn().mockResolvedValue({ text: "Water refracts sunlight [S1].",usage: { ...knownUsage,costMicroUsd: 200n,actualModel: "test/answer" } }) });
beforeAll(async()=>{ const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));for (const e of journal.entries) await pg.exec(await readFile(`drizzle/${e.tag}.sql`,"utf8")); });
beforeEach(async()=>{ await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);person = await seedCompletion(db);sessionId = (await completionSession(db,person.subject)).sessionId; });
afterAll(()=>pg.close());
async function complete(model = answer(),output: SafetyProvider = fakeSafety()) { return createAnswerCompletion(db,{ answer: model,output }).complete(person.subject,sessionId,person.runId,signal()); }
it("atomically persists the approved message, review, citation, sequence, terminal state and settlement",async()=>{
  await prepareCompletion(db,person);expect((await complete()).kind).toBe("COMMITTED");
  const rows = await db.select().from(schema.messages);expect(rows).toHaveLength(2);expect(rows[1]).toMatchObject({ role: "ASSISTANT",sequence: 2,parts: [{ type: "text",text: "Water refracts sunlight [S1]." }] });
  expect((await db.select().from(schema.outputReviews))[0].decision).toBe("ALLOW");expect(await db.select().from(schema.messageCitations)).toHaveLength(1);
  expect((await db.select().from(schema.runs))[0].status).toBe("COMPLETED");
  const receipt = (await db.select().from(schema.runSettlements))[0];expect(receipt).toMatchObject({ creditsCharged: 5,knownProviderMicroUsd: 600n,heldProviderMicroUsd: 49400n,releasedProviderMicroUsd: 0n });
  expect((await db.select().from(schema.usageBuckets)).every(b=>b.reservedCredits === 0 && b.settledCredits === 5 && b.reservedProviderMicroUsd === 49400n && b.settledProviderMicroUsd === 600n)).toBe(true);
});
it("duplicate completion returns the canonical message without new calls or charges",async()=>{
  await prepareCompletion(db,person);const model = answer(),service = createAnswerCompletion(db,{ answer: model,output: fakeSafety() });
  const first = await service.complete(person.subject,sessionId,person.runId,signal()),second = await service.complete(person.subject,sessionId,person.runId,signal());
  expect(first.kind).toBe("COMMITTED");expect(second).toEqual({ ...first,kind: "ALREADY_COMMITTED" });expect(model.generate).toHaveBeenCalledOnce();
  expect(await db.select().from(schema.runSettlements)).toHaveLength(1);expect(await db.select().from(schema.messages)).toHaveLength(2);
});
it("fully known costs release only the unused provider hold",async()=>{
  await prepareCompletion(db,person);
  await db.update(schema.providerCalls).set({ costMicroUsd: 8000n }).where(eq(schema.providerCalls.stage,"SEARCH"));
  expect((await complete()).kind).toBe("COMMITTED");
  expect((await db.select().from(schema.runSettlements))[0]).toMatchObject({ knownProviderMicroUsd: 8600n,heldProviderMicroUsd: 0n,releasedProviderMicroUsd: 41400n });
});
it("no-evidence still passes output safety and does not charge customer answer credits",async()=>{
  await prepareCompletion(db,person,undefined,true);const model = answer();expect((await complete(model)).kind).toBe("COMMITTED");expect(model.generate).not.toHaveBeenCalled();
  expect((await db.select().from(schema.runSettlements))[0].creditsCharged).toBe(0);expect((await db.select().from(schema.messages))[1].parts[0].text).toContain("enough usable evidence");
});
it("output rejection and provider outages refund credits and store no raw draft",async()=>{
  await prepareCompletion(db,person);const output = { ...fakeSafety(),classify: async()=>({ decision: "BLOCK",categoryCodes: ["FRAUD"],policyVersion: "v1" }) };
  expect((await complete(answer(),output)).kind).toBe("DENIED");expect(await db.select().from(schema.messages)).toHaveLength(1);
  expect((await db.select().from(schema.runSettlements))[0].creditsCharged).toBe(0);expect((await db.select().from(schema.outputReviews))[0].payload).toBeNull();
});
it("rolled-back message/citation writes expose no committed success or partial settlement",async()=>{
  await prepareCompletion(db,person);
  await pg.exec("CREATE FUNCTION deny_citation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER deny_citation BEFORE INSERT ON message_citations FOR EACH ROW EXECUTE FUNCTION deny_citation();");
  try { expect((await complete()).kind).toBe("DENIED");expect(await db.select().from(schema.messages)).toHaveLength(1);expect(await db.select().from(schema.outputReviews)).toHaveLength(0);expect(await db.select().from(schema.runSettlements)).toHaveLength(0); }
  finally { await pg.exec("DROP TRIGGER deny_citation ON message_citations; DROP FUNCTION deny_citation();"); }
});
it.each(["revision","attempt","cancel","session"])("late %s changes prevent canonical persistence",async(change)=>{
  await prepareCompletion(db,person);const controller = new AbortController();
  const output = { ...fakeSafety(),classify: async()=>{
    if (change === "revision") await db.update(schema.conversations).set({ revision: 2 }).where(eq(schema.conversations.id,person.conversation.id));
    if (change === "attempt") await db.update(schema.runs).set({ attemptVersion: 2 }).where(eq(schema.runs.id,person.runId));
    if (change === "cancel") controller.abort();
    if (change === "session") await db.delete(schema.session).where(eq(schema.session.id,sessionId));
    return { decision: "ALLOW",categoryCodes: [],policyVersion: "v1" };
  } };
  const result = await createAnswerCompletion(db,{ answer: answer(),output }).complete(person.subject,sessionId,person.runId,controller.signal);
  expect(result.kind).toBe("DENIED");expect(await db.select().from(schema.messages)).toHaveLength(1);
});
it("an arbitrary object cannot authorize an assistant insert",async()=>{
  const result = await createFinalization(db).commit(person.subject,sessionId,{ runId: person.runId,markdown: "FORGED" },signal());
  expect(result).toEqual({ kind: "DENIED",code: "OUTPUT_BLOCKED" });expect(await db.select().from(schema.outputReviews)).toHaveLength(0);
});
it("concurrent callers cannot duplicate generation or cancel the winning attempt",async()=>{
  await prepareCompletion(db,person);const model = answer();let release!: ()=>void;
  model.generate.mockImplementation(()=>new Promise(resolve=>{ release = ()=>resolve({ text: "Water refracts sunlight [S1].",usage: { ...knownUsage,costMicroUsd: 200n } }); }));
  const service = createAnswerCompletion(db,{ answer: model,output: fakeSafety() });
  const pending = service.complete(person.subject,sessionId,person.runId,signal());
  await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
  const second = await service.complete(person.subject,sessionId,person.runId,signal());
  expect(second.kind).toBe("DENIED");release();expect((await pending).kind).toBe("COMMITTED");
  expect(model.generate).toHaveBeenCalledOnce();expect(await db.select().from(schema.runSettlements)).toHaveLength(1);
});
it("a reported stage overage cannot be hidden inside the total reservation",async()=>{
  await prepareCompletion(db,person);const model = answer();model.generate.mockResolvedValue({ text: "Water refracts sunlight [S1].",usage: { ...knownUsage,costMicroUsd: 21000n } });
  expect((await complete(model)).kind).toBe("DENIED");expect(await db.select().from(schema.messages)).toHaveLength(1);
  expect((await db.select().from(schema.providerCalls).where(eq(schema.providerCalls.stage,"ANSWER")))[0].costMicroUsd).toBe(21000n);
});
it("invalid citations stop output classification and never enter history",async()=>{
  await prepareCompletion(db,person);const model = answer();model.generate.mockResolvedValue({ text: "Invented [S9].",usage: knownUsage });
  const classify = vi.fn().mockResolvedValue({ decision: "ALLOW",categoryCodes: [],policyVersion: "v1" });
  expect((await complete(model,{ ...fakeSafety(),classify })).kind).toBe("DENIED");expect(classify).not.toHaveBeenCalled();
  expect(await db.select().from(schema.messages)).toHaveLength(1);
});
it("expired and revoked sessions cannot recover an otherwise saved result",async()=>{
  await prepareCompletion(db,person);expect((await complete()).kind).toBe("COMMITTED");
  await db.update(schema.session).set({ expiresAt: new Date(0) }).where(eq(schema.session.id,sessionId));
  expect(await complete()).toMatchObject({ kind: "DENIED",code: "UNAUTHENTICATED" });
});
it("citations cannot point to another source or run even with valid IDs",async()=>{
  await prepareCompletion(db,person);expect((await complete()).kind).toBe("COMMITTED");
  const [review] = await db.select().from(schema.outputReviews),[passage] = await db.select().from(schema.sourcePassages);
  const [secondSource] = await db.insert(schema.runSources).values({ runId: person.runId,sourceKey: "S2",url: "https://example.org/second",title: "Second",rank: 2,retrievedAt: new Date() }).returning();
  await expect(db.insert(schema.messageCitations).values({ runId: person.runId,messageId: review.messageId!,sourceId: secondSource.id,passageId: passage.id,number: 2 })).rejects.toMatchObject({ cause: { code: "23503" } });
});
it("failure settlement is idempotent and old accounting data never becomes zero spend",async()=>{
  await db.update(schema.runs).set({ accountingVersion: 0 }).where(eq(schema.runs.id,person.runId));
  const finalizer = createFinalization(db);
  await finalizer.fail(person.subject,person.runId,"PROVIDER_UNAVAILABLE");await finalizer.fail(person.subject,person.runId,"PROVIDER_UNAVAILABLE");
  const receipts = await db.select().from(schema.runSettlements);expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({ creditsCharged: 0,knownProviderMicroUsd: 0n,heldProviderMicroUsd: 50000n,releasedProviderMicroUsd: 0n });
});
it("quarantining the original approved question during checking blocks final persistence",async()=>{
  await prepareCompletion(db,person);
  const output = { ...fakeSafety(),classify: async()=>{
    await db.update(schema.messages).set({ policyVersion: "quarantined" }).where(eq(schema.messages.role,"USER"));
    return { decision: "ALLOW",categoryCodes: [],policyVersion: "v1" };
  } };
  expect((await complete(answer(),output)).kind).toBe("DENIED");expect(await db.select().from(schema.messages)).toHaveLength(1);
});
it("RLS binds the reviewed body and rejects hidden extra JSON fields",async()=>{
  const { randomUUID } = await import("node:crypto"),{ hashPassage } = await import("@/server/search/evidence");
  await pg.exec("CREATE ROLE answer_writer_test; GRANT USAGE ON SCHEMA public TO answer_writer_test; GRANT SELECT,INSERT ON messages TO answer_writer_test; GRANT SELECT ON output_safety_reviews,input_safety_reviews TO answer_writer_test;");
  for (const parts of [[{ type: "text",text: "WRONG BODY" }],[{ type: "text",text: "Approved text",reasoning: "HIDDEN" }]]) {
    await expect(db.transaction(async tx=>{
      const messageId = randomUUID();
      await tx.insert(schema.outputReviews).values({ runId: person.runId,conversationId: person.conversation.id,attemptVersion: 1,decision: "ALLOW",policyVersion: "v1",messageId,
        bodyHash: hashPassage("Approved text"),payloadHash: "a".repeat(64),payload: { runId: person.runId,attemptVersion: 1,revision: 1,policyVersion: "v1",kind: "NO_EVIDENCE",markdown: "Approved text",sources: [] },createdAt: new Date() });
      await tx.execute((await import("drizzle-orm")).sql`SET LOCAL ROLE answer_writer_test`);
      await tx.insert(schema.messages).values({ id: messageId,conversationId: person.conversation.id,role: "ASSISTANT",kind: "ANSWER",sequence: 2,parts: parts.map(p=>({ ...p,type: "text" as const })),approvedAt: new Date(),policyVersion: "v1" });
    })).rejects.toMatchObject({ cause: { code: "42501" } });
  }
});

it("late provider outcomes preserve the remaining hold after a failure receipt commits",async()=>{
  await prepareCompletion(db,person);
  const { createProviderCalls } = await import("@/server/runs/provider-calls");
  const calls = createProviderCalls(db,person.subject,person.runId),{id} = await calls.begin("ANSWER","test/answer");
  const finalizer = createFinalization(db);
  expect(await finalizer.fail(person.subject,person.runId,"PROVIDER_UNAVAILABLE")).toMatchObject({ kind: "DENIED" });
  const [receipt] = await db.select().from(schema.runSettlements);
  expect(receipt).toMatchObject({ creditsCharged: 0,knownProviderMicroUsd: 300n,heldProviderMicroUsd: 49700n,releasedProviderMicroUsd: 0n });
  await calls.finish(id,"UNKNOWN",{ ...knownUsage,costMicroUsd: 200n });
  expect((await db.select().from(schema.providerCalls).where(eq(schema.providerCalls.id,id)))[0]).toMatchObject({ status: "UNKNOWN",costMicroUsd: 200n });
  // Late accounting cannot mutate the immutable receipt or silently release its unknown hold.
  expect(await db.select().from(schema.runSettlements)).toEqual([receipt]);
  expect((await db.select().from(schema.usageBuckets)).every(b=>b.reservedProviderMicroUsd === 49700n && b.settledProviderMicroUsd === 300n && b.reservedCredits === 0)).toBe(true);
  await finalizer.fail(person.subject,person.runId,"PROVIDER_UNAVAILABLE");
  expect(await db.select().from(schema.runSettlements)).toEqual([receipt]);
});
it("history exposes approved presentation and excludes private provenance fields",async()=>{
  await prepareCompletion(db,person);expect((await complete()).kind).toBe("COMMITTED");
  const { createConversationRepository } = await import("@/server/conversations/repository");
  const repository = createConversationRepository(db),history = await repository.history(person.subject,person.conversation.id,{ limit: 20 });
  expect(history.items[1].answer?.sources).toMatchObject([{ number: 1,url: "https://example.org/rainbows",domain: "example.org",supportStatus: "NOT_CHECKED" }]);
  expect(JSON.stringify(history)).not.toMatch(/contentHash|passageId|capMicroUsd|payloadHash|actualModel/);
  await expect(repository.history("other-user",person.conversation.id,{ limit: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("history fails safely when canonical payload and approved message diverge",async()=>{
  await prepareCompletion(db,person);expect((await complete()).kind).toBe("COMMITTED");
  const { createConversationRepository } = await import("@/server/conversations/repository");
  await db.update(schema.messages).set({ parts: [{ type: "text",text: "CORRUPTED PRIVATE TEXT" }] }).where(eq(schema.messages.role,"ASSISTANT"));
  await expect(createConversationRepository(db).history(person.subject,person.conversation.id,{ limit: 20 })).rejects.toMatchObject({ code: "UNAVAILABLE" });
});
it.each(['INPUT_BLOCKED','OUTPUT_BLOCKED'] as const)('retains %s when final settlement crosses the deadline',async code=>{
 await db.update(schema.runs).set({status:'CHECKING_OUTPUT',createdAt:new Date(Date.now()-120000),deadlineAt:new Date(Date.now()-1000)}).where(eq(schema.runs.id,person.runId));
 expect(await createFinalization(db).fail(person.subject,person.runId,code)).toEqual({kind:'DENIED',code});
 expect((await db.select().from(schema.runs))[0].status).toBe('BLOCKED');
 expect((await db.select().from(schema.outputReviews))[0].decision).toBe('BLOCK');
 expect((await db.select().from(schema.runSettlements))[0].creditsCharged).toBe(0);
});
