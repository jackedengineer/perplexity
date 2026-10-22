import { eq } from "drizzle-orm";
import { afterAll,afterEach,expect,it,vi } from "vitest";
import * as schema from "@/db/schema";
import { createNeonFixture,simultaneously } from "./admission-fixture";
import { prepareCompletion,completionSession,fakeSafety,knownUsage } from "../helpers/completion";
import { createAnswerCompletion } from "@/server/runs/complete";
const f = createNeonFixture(),signal = ()=>new AbortController().signal;
const answer = () => ({ modelId: "test/answer",generate: vi.fn().mockResolvedValue({ text: "Water refracts sunlight [S1].",usage: { ...knownUsage,costMicroUsd: 200n } }) });
afterEach(()=>f.cleanup());afterAll(()=>f.close());
async function fixture(budgets = true) {
  const person = await f.identity();if (budgets) await f.budgets();person.request.message.text = "Why do rainbows form?";
  const admitted = await f.admission.admit(person.subject,person.request);if (admitted.kind !== "ADMITTED") throw new Error("Synthetic admission failed");
  const completePerson = { ...person,runId: admitted.run.id,...await completionSession(f.owner,person.subject) };
  await prepareCompletion(f.runtime,completePerson,f.keys);return completePerson;
}
it("commits reviewed history and all ledger records through the restricted role",async()=>{
  const person = await fixture(),model = answer(),service = createAnswerCompletion(f.runtime,{ answer: model,output: fakeSafety() });
  const result = await service.complete(person.subject,person.sessionId,person.runId,signal());expect(result.kind).toBe("COMMITTED");
  const [receipt] = await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,person.runId));
  expect(receipt).toMatchObject({ creditsCharged: 5,knownProviderMicroUsd: 600n,heldProviderMicroUsd: 49400n });
  expect(await f.owner.select().from(schema.messageCitations).where(eq(schema.messageCitations.runId,person.runId))).toHaveLength(1);
  expect(await service.complete(person.subject,person.sessionId,person.runId,signal())).toEqual({ ...result,kind: "ALREADY_COMMITTED" });expect(model.generate).toHaveBeenCalledOnce();
},60000);
it("four completion callers produce one canonical answer and cannot cancel the winner",async()=>{
  const person = await fixture(),model = answer(),service = createAnswerCompletion(f.runtime,{ answer: model,output: fakeSafety() });
  const results = await simultaneously(Array.from({ length: 4 },()=>()=>service.complete(person.subject,person.sessionId,person.runId,signal())));
  expect(results.filter(r=>r.kind === "COMMITTED")).toHaveLength(1);expect(model.generate).toHaveBeenCalledOnce();
  expect(await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,person.runId))).toHaveLength(1);
  expect((await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,person.conversation.id))).filter(m=>m.role === "ASSISTANT")).toHaveLength(1);
},60000);
it("output denial stores fixed metadata only and refunds customer answer credits",async()=>{
  const person = await fixture(),model = answer();model.generate.mockResolvedValue({ text: "UNREVIEWED_PRIVATE_DRAFT [S1]",usage: { ...knownUsage,costMicroUsd: 200n } });
  const output = { ...fakeSafety(),classify: async()=>({ decision: "BLOCK",categoryCodes: ["FRAUD"],policyVersion: "v1" }) };
  expect((await createAnswerCompletion(f.runtime,{ answer: model,output }).complete(person.subject,person.sessionId,person.runId,signal())).kind).toBe("DENIED");
  const [review] = await f.owner.select().from(schema.outputReviews).where(eq(schema.outputReviews.runId,person.runId));
  expect(review).toMatchObject({ decision: "BLOCK",payload: null });expect(JSON.stringify(review)).not.toContain("UNREVIEWED_PRIVATE_DRAFT");
  expect((await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,person.runId)))[0].creditsCharged).toBe(0);
},60000);
it("runtime cannot write an unreviewed assistant or mutate committed audit records",async()=>{
  const person = await fixture();
  await expect(f.runtime.insert(schema.messages).values({ conversationId: person.conversation.id,role: "ASSISTANT",kind: "ANSWER",sequence: 2,parts: [{ type: "text",text: "UNREVIEWED" }],approvedAt: new Date(),policyVersion: "v1" })).rejects.toMatchObject({ cause: { code: "42501" } });
  expect((await createAnswerCompletion(f.runtime,{ answer: answer(),output: fakeSafety() }).complete(person.subject,person.sessionId,person.runId,signal())).kind).toBe("COMMITTED");
  await expect(f.runtime.update(schema.outputReviews).set({ decision: "BLOCK" }).where(eq(schema.outputReviews.runId,person.runId))).rejects.toMatchObject({ cause: { code: "42501" } });
  await expect(f.runtime.delete(schema.runSettlements).where(eq(schema.runSettlements.runId,person.runId))).rejects.toMatchObject({ cause: { code: "42501" } });
  await expect(f.runtime.update(schema.providerCalls).set({ capMicroUsd: 1n }).where(eq(schema.providerCalls.runId,person.runId))).rejects.toMatchObject({ cause: { code: "42501" } });
},60000);
it("session revocation during output checking prevents answer persistence",async()=>{
  const person = await fixture();
  const output = { ...fakeSafety(),classify: async()=>{ await f.owner.delete(schema.session).where(eq(schema.session.id,person.sessionId));return { decision: "ALLOW",categoryCodes: [],policyVersion: "v1" }; } };
  expect(await createAnswerCompletion(f.runtime,{ answer: answer(),output }).complete(person.subject,person.sessionId,person.runId,signal())).toMatchObject({ kind: "DENIED",code: "UNAUTHENTICATED" });
  expect((await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,person.conversation.id))).filter(m=>m.role === "ASSISTANT")).toHaveLength(0);
},60000);
it("source metadata changed after inspection cannot be persisted as an approved citation",async()=>{
  const person = await fixture();
  const output = { ...fakeSafety(),classify: async()=>{ await f.owner.update(schema.runSources).set({ title: "Changed after checking" }).where(eq(schema.runSources.runId,person.runId));return { decision: "ALLOW",categoryCodes: [],policyVersion: "v1" }; } };
  expect((await createAnswerCompletion(f.runtime,{ answer: answer(),output }).complete(person.subject,person.sessionId,person.runId,signal())).kind).toBe("DENIED");
  expect(await f.owner.select().from(schema.outputReviews).where(eq(schema.outputReviews.runId,person.runId))).toHaveLength(0);
},60000);
it("the database rejects citation references from a different admitted run",async()=>{
  const person = await fixture();const completed = await createAnswerCompletion(f.runtime,{ answer: answer(),output: fakeSafety() }).complete(person.subject,person.sessionId,person.runId,signal());
  if (completed.kind === "DENIED") throw new Error("Synthetic completion failed");const other = await fixture(false);
  const [source] = await f.owner.select().from(schema.runSources).where(eq(schema.runSources.runId,other.runId));
  const [passage] = await f.owner.select().from(schema.sourcePassages).where(eq(schema.sourcePassages.runId,other.runId));
  await expect(f.runtime.insert(schema.messageCitations).values({ runId: person.runId,messageId: completed.messageId,sourceId: source.id,passageId: passage.id,number: 2 })).rejects.toMatchObject({ cause: { code: "23503" } });
},90000);
