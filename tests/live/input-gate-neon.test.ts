import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createMessageAcceptance } from "@/server/runs/accept-message";
import { createInputGate } from "@/server/safety/input";
import type { SafetyInput } from "@/server/safety/provider";
import { createNeonFixture, simultaneously } from "./admission-fixture";
const f = createNeonFixture();
const allow = { decision: "ALLOW",categoryCodes: [],policyVersion: "v1" };
const provider = () => ({ modelId: "test/safety",classify: vi.fn<(input: SafetyInput,signal: AbortSignal)=>Promise<unknown>>().mockResolvedValue(allow) });
const signal = () => new AbortController().signal;
afterEach(()=>f.cleanup()); afterAll(()=>f.close());
async function fixture() {
  const person = await f.identity(); await f.budgets();
  const admitted = await f.admission.admit(person.subject,person.request);
  if (admitted.kind !== "ADMITTED") throw new Error("Synthetic admission failed");
  return { ...person,runId: admitted.run.id };
}
it("commits an original question and matching review through the restricted RLS role", async()=>{
  const person = await fixture(), model = provider();
  const acceptance = createMessageAcceptance(f.runtime,f.keys,createInputGate(model));
  expect(await acceptance.accept(person.subject,person.runId,person.request,signal())).toMatchObject({ kind: "ACCEPTED",runId: person.runId });
  const [message] = await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,person.conversation.id));
  const [review] = await f.owner.select().from(schema.inputSafetyReviews).where(eq(schema.inputSafetyReviews.runId,person.runId));
  expect(message.parts).toEqual([{ type: "text",text: person.request.message.text }]);
  expect(review).toMatchObject({ decision: "ALLOW",acceptedMessageId: message.id });
  expect(model.classify).toHaveBeenCalledOnce();
});
it("concurrent input claims classify and persist exactly once", async()=>{
  const person = await fixture(), model = provider();
  const acceptance = createMessageAcceptance(f.runtime,f.keys,createInputGate(model));
  const results = await simultaneously(Array.from({ length: 4 },()=>()=>acceptance.accept(person.subject,person.runId,person.request,signal())));
  expect(results.filter((r)=>r.kind === "ACCEPTED")).toHaveLength(1);
  expect(results.filter((r)=>r.kind === "RUN_IN_PROGRESS")).toHaveLength(3);
  expect(model.classify).toHaveBeenCalledOnce();
  expect(await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,person.conversation.id))).toHaveLength(1);
  expect(await f.owner.select().from(schema.inputSafetyReviews).where(eq(schema.inputSafetyReviews.runId,person.runId))).toHaveLength(1);
});
it("persists only safe decision metadata on classifier rejection or unavailable configuration", async()=>{
  const person = await fixture(), model = provider();
  model.classify.mockResolvedValue({ decision: "BLOCK",categoryCodes: ["FRAUD"],policyVersion: "v1" });
  const acceptance = createMessageAcceptance(f.runtime,f.keys,createInputGate(model));
  expect(await acceptance.accept(person.subject,person.runId,person.request,signal())).toMatchObject({ kind: "DENIED",code: "INPUT_BLOCKED" });
  expect(await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,person.conversation.id))).toHaveLength(0);
  const [review] = await f.owner.select().from(schema.inputSafetyReviews).where(eq(schema.inputSafetyReviews.runId,person.runId));
  expect(review).toMatchObject({ decision: "BLOCK",acceptedMessageId: null });
  expect(JSON.stringify(review)).not.toContain(person.request.message.text);
  const other = await f.identity();
  const admitted = await f.admission.admit(other.subject,other.request);
  if (admitted.kind !== "ADMITTED") throw new Error("Synthetic admission failed");
  const missing = createMessageAcceptance(f.runtime,f.keys,createInputGate(undefined));
  expect(await missing.accept(other.subject,admitted.run.id,other.request,signal())).toMatchObject({ kind: "DENIED",code: "SAFETY_UNAVAILABLE" });
  expect(await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,other.conversation.id))).toHaveLength(0);
});
it("denies direct assistant, draft and unreviewed question inserts under the runtime role", async()=>{
  const person = await fixture();
  for (const fields of [{ role: "ASSISTANT",kind: "ANSWER" },{ role: "USER",kind: "QUESTION" },{ role: "USER",kind: "QUESTION",approvedAt: null }] as const) {
    await expect(f.runtime.insert(schema.messages).values({ id: randomUUID(),conversationId: person.conversation.id,sequence: 1,
      policyVersion: "v1",approvedAt: new Date(),parts: [{ type: "text",text: "Synthetic RLS rejection" }],...fields })).rejects.toMatchObject({ cause: { code: "42501" } });
  }
});
it("a concurrent fencing change prevents a late classifier ALLOW from storing a message", async()=>{
  const person = await fixture(), model = provider();
  model.classify.mockImplementation(async()=>{
    await f.owner.update(schema.runs).set({ attemptVersion: 2 }).where(eq(schema.runs.id,person.runId));
    return allow;
  });
  const acceptance = createMessageAcceptance(f.runtime,f.keys,createInputGate(model));
  expect(await acceptance.accept(person.subject,person.runId,person.request,signal())).toMatchObject({ kind: "DENIED",code: "CONFLICT" });
  expect(await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,person.conversation.id))).toHaveLength(0);
  expect(await f.owner.select().from(schema.inputSafetyReviews).where(eq(schema.inputSafetyReviews.runId,person.runId))).toHaveLength(0);
});
it("blocks a synthetic credential before the classifier and never persists its raw text", async()=>{
  const person = await f.identity(); await f.budgets();
  person.request.message.text = "sk-or-v1-"+"f".repeat(64);
  const admitted = await f.admission.admit(person.subject,person.request);
  if (admitted.kind !== "ADMITTED") throw new Error("Synthetic admission failed");
  const model = provider(), acceptance = createMessageAcceptance(f.runtime,f.keys,createInputGate(model));
  const result = await acceptance.accept(person.subject,admitted.run.id,person.request,signal());
  expect(result).toMatchObject({ kind: "DENIED",response: { code: "REDACT_SECRET" } });
  expect(model.classify).not.toHaveBeenCalled();
  const reviews = await f.owner.select().from(schema.inputSafetyReviews).where(eq(schema.inputSafetyReviews.runId,admitted.run.id));
  expect(JSON.stringify([result,reviews])).not.toContain(person.request.message.text);
  expect(await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,person.conversation.id))).toHaveLength(0);
});
