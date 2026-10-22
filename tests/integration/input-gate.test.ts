import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createRunAdmission } from "@/server/runs/admit";
import { createMessageAcceptance } from "@/server/runs/accept-message";
import { createInputGate } from "@/server/safety/input";
import type { SafetyInput } from "@/server/safety/provider";
import { FREE_ADMISSION_POLICY } from "@/server/runs/policy";
const pg = new PGlite(), db = drizzle(pg,{ schema });
const keys = { activeKeyId: "test-v1",keys: { "test-v1": "a".repeat(64) } };
const policy = { ...FREE_ADMISSION_POLICY,operatorBudgetKey: "input-tests" };
const allow = { decision: "ALLOW",categoryCodes: [],policyVersion: "v1" };
let subject: string, conversationId: string, runId: string;
let request: { conversationId: string;clientRequestId: string;expectedRevision: number;mode: string;modelKey: string;message: { text: string } };
const classifier = () => ({ modelId: "test/safety", classify: vi.fn<(input: SafetyInput,signal: AbortSignal)=>Promise<unknown>>().mockResolvedValue(allow) });
const controller = () => new AbortController();
beforeAll(async()=>{
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));
  for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,"utf8"));
});
beforeEach(async()=>{
  await db.delete(schema.user); await db.delete(schema.operatorUsageBuckets);
  subject = randomUUID(); await db.insert(schema.user).values({ id: subject,name: "Synthetic",email: `${subject}@example.test` });
  const [owner] = await db.insert(schema.appUsers).values({ authSubject: subject }).returning();
  const [conversation] = await db.insert(schema.conversations).values({ userId: owner.id,creationRequestId: randomUUID(),creationFingerprint: "synthetic",title: "Test" }).returning();
  conversationId = conversation.id;
  for (const kind of ["PERIOD","DAY"] as const) {
    const window = { startsAt: new Date(Date.now()-86_400_000),endsAt: new Date(Date.now()+86_400_000) };
    await db.insert(schema.usageBuckets).values({ userId: owner.id,kind,...window,entitlementVersion: "test-v1",creditLimit: 10,providerLimitMicroUsd: 100000n });
    await db.insert(schema.operatorUsageBuckets).values({ budgetKey: policy.operatorBudgetKey,kind,...window,providerLimitMicroUsd: 100000n });
  }
  request = { conversationId,clientRequestId: randomUUID(),expectedRevision: 0,mode: "FAST",modelKey: "fast-default",message: { text: "  Explain account security 🌈\nKeep this exact question. " } };
  const admission = await createRunAdmission(db,keys,policy).admit(subject,request);
  if (admission.kind !== "ADMITTED") throw new Error("Synthetic admission failed");
  runId = admission.run.id;
});
afterAll(()=>pg.close());
function pipeline(provider = classifier()) {
  const acceptance = createMessageAcceptance(db,keys,createInputGate(provider));
  const planner = vi.fn(),tavily = vi.fn(),answer = vi.fn();
  // Future T11 continuation harness: only committed acceptance may enter task work.
  const execute = async(signal = controller().signal) => {
    const result = await acceptance.accept(subject,runId,request,signal);
    if (result.kind === "ACCEPTED" && !signal.aborted) { await planner(); await tavily(); await answer(); }
    return result;
  };
  return { provider,acceptance,planner,tavily,answer,execute };
}
it("atomically persists the original approved question, metadata, sequence and next state", async()=>{
  const p = pipeline(); expect(await p.execute()).toMatchObject({ kind: "ACCEPTED",runId,revision: 1 });
  const [message] = await db.select().from(schema.messages), [review] = await db.select().from(schema.inputSafetyReviews);
  expect(message.parts).toEqual([{ type: "text",text: request.message.text }]);
  expect(message).toMatchObject({ role: "USER",kind: "QUESTION",sequence: 1,policyVersion: "v1" }); expect(message.approvedAt).toBeInstanceOf(Date);
  expect(review).toMatchObject({ decision: "ALLOW",categoryCodes: [],acceptedMessageId: message.id,modelId: "test/safety" });
  expect((await db.select().from(schema.runs))[0].status).toBe("PLANNING");
  expect((await db.select().from(schema.conversations))[0]).toMatchObject({ nextSequence: 2,revision: 1 });
  expect((await db.select().from(schema.usageBuckets)).map((r)=>r.reservedCredits)).toEqual([5,5]);
  expect(p.planner).toHaveBeenCalledOnce(); expect(p.tavily).toHaveBeenCalledOnce(); expect(p.answer).toHaveBeenCalledOnce();
});
it.each(["blocked","malformed","outage"])("%s verdict creates metadata only and prevents all downstream calls", async(kind)=>{
  const provider = classifier();
  if (kind === "blocked") provider.classify.mockResolvedValue({ decision: "BLOCK",categoryCodes: ["FRAUD"],policyVersion: "v1" });
  if (kind === "malformed") provider.classify.mockResolvedValue({ ...allow,explanation: "PRIVATE classifier prose" });
  if (kind === "outage") provider.classify.mockRejectedValue(new Error("PRIVATE driver failure"));
  const p = pipeline(provider), result = await p.execute();
  expect(result).toMatchObject({ kind: "DENIED",code: kind === "blocked" ? "INPUT_BLOCKED" : "SAFETY_UNAVAILABLE" });
  expect(await db.select().from(schema.messages)).toHaveLength(0);
  const [review] = await db.select().from(schema.inputSafetyReviews);
  expect(review.acceptedMessageId).toBeNull(); expect(review.decision).toBe(kind === "blocked" ? "BLOCK" : "UNAVAILABLE");
  expect(JSON.stringify([result,review])).not.toMatch(/PRIVATE|Explain account security/);
  expect(p.planner).not.toHaveBeenCalled(); expect(p.tavily).not.toHaveBeenCalled(); expect(p.answer).not.toHaveBeenCalled();
});
it("cannot classify a foreign, changed-payload or stale-revision run", async()=>{
  const p = pipeline();
  expect(await p.acceptance.accept("foreign",runId,request,controller().signal)).toMatchObject({ kind: "DENIED",code: "NOT_FOUND" });
  expect(await p.acceptance.accept(subject,runId,{ ...request,message: { text: "Changed" } },controller().signal)).toMatchObject({ kind: "DENIED",code: "IDEMPOTENCY_MISMATCH" });
  await db.update(schema.conversations).set({ revision: 2 });
  expect(await p.execute()).toMatchObject({ kind: "DENIED",code: "CONFLICT" });
  expect(p.provider.classify).not.toHaveBeenCalled(); expect(await db.select().from(schema.inputSafetyReviews)).toHaveLength(0);
});
it("passes only bounded approved current-policy context from the owned conversation", async()=>{
  for (const row of [{ role: "USER",kind: "QUESTION",policyVersion: "v1",approvedAt: new Date(),text: "Earlier authorized discussion" },
    { role: "ASSISTANT",kind: "ANSWER",policyVersion: "v1",approvedAt: null,text: "PRIVATE draft" }] as const) {
    await db.insert(schema.messages).values({ conversationId,role: row.role,kind: row.kind,policyVersion: row.policyVersion,approvedAt: row.approvedAt,
      sequence: row.role === "ASSISTANT" ? 2 : 1,parts: [{ type: "text",text: row.text }] });
  }
  await db.update(schema.conversations).set({ nextSequence: 3 });
  const p = pipeline(); await p.execute();
  expect(p.provider.classify.mock.calls[0][0].context).toEqual([{ role: "USER",text: "Earlier authorized discussion" }]);
});
it("claims once across concurrent attempts and never repeats a classifier after acceptance", async()=>{
  const provider = classifier(); let release!: (value: unknown)=>void, started!: ()=>void;
  const entered = new Promise<void>((resolve)=>{ started=resolve; });
  provider.classify.mockImplementation(()=>{ started(); return new Promise((resolve)=>{ release=resolve; }); });
  const p = pipeline(provider), first = p.execute(); await entered;
  expect(await p.execute()).toMatchObject({ kind: "RUN_IN_PROGRESS" });
  release(allow); expect(await first).toMatchObject({ kind: "ACCEPTED" });
  expect(await p.execute()).toMatchObject({ kind: "RUN_IN_PROGRESS" });
  expect(provider.classify).toHaveBeenCalledOnce(); expect(await db.select().from(schema.messages)).toHaveLength(1);
});
it.each(["fence","revision","deadline","cancel"])("a late %s change prevents acceptance without holding a lock over the provider", async(change)=>{
  const provider = classifier(), abort = controller();
  provider.classify.mockImplementation(async()=>{
    if (change === "fence") await db.update(schema.runs).set({ attemptVersion: 2 });
    if (change === "revision") await db.update(schema.conversations).set({ revision: 2 });
    if (change === "deadline") await db.update(schema.runs).set({ createdAt: new Date(Date.now()-120000),deadlineAt: new Date(Date.now()-60000) });
    if (change === "cancel") abort.abort("PRIVATE abort reason");
    return allow;
  });
  const p = pipeline(provider), result = await p.execute(abort.signal);
  expect(result.kind).toBe("DENIED"); expect(await db.select().from(schema.messages)).toHaveLength(0);
  expect(p.planner).not.toHaveBeenCalled(); expect(p.tavily).not.toHaveBeenCalled(); expect(p.answer).not.toHaveBeenCalled();
  const reviews = await db.select().from(schema.inputSafetyReviews);
  if (change === "deadline" || change === "cancel") expect(reviews[0]).toMatchObject({ decision: "UNAVAILABLE",reason: change === "cancel" ? "CANCELLED" : "TIMEOUT" });
  else expect(reviews).toHaveLength(0);
});
it("rolls back ALLOW metadata and sequencing when the approved message insert fails", async()=>{
  await pg.exec(`CREATE FUNCTION reject_input_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic message failure'; END $$;
    CREATE TRIGGER reject_input_message BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION reject_input_message()`);
  const p = pipeline();
  try {
    await expect(p.execute()).rejects.toMatchObject({ cause: { message: "synthetic message failure" } });
    expect(await db.select().from(schema.messages)).toHaveLength(0); expect(await db.select().from(schema.inputSafetyReviews)).toHaveLength(0);
    expect((await db.select().from(schema.conversations))[0].nextSequence).toBe(1);
    expect((await db.select().from(schema.runs))[0].status).toBe("CHECKING_INPUT");
    expect(await p.execute()).toMatchObject({ kind: "RUN_IN_PROGRESS" }); expect(p.provider.classify).toHaveBeenCalledOnce();
    expect(p.planner).not.toHaveBeenCalled();
  } finally { await pg.exec("DROP TRIGGER reject_input_message ON messages; DROP FUNCTION reject_input_message()"); }
});
it("a run-capped timeout cannot enter task work even with a non-cooperative classifier", async()=>{
  await db.update(schema.runs).set({ deadlineAt: new Date(Date.now()+500) }).where(eq(schema.runs.id,runId));
  const provider = classifier(); provider.classify.mockImplementation(()=>new Promise(()=>undefined));
  const p = pipeline(provider);
  expect(await p.execute()).toMatchObject({ kind: "DENIED",code: "SAFETY_UNAVAILABLE" });
  expect((await db.select().from(schema.inputSafetyReviews))[0]).toMatchObject({ decision: "UNAVAILABLE",reason: "TIMEOUT" });
  expect(p.tavily).not.toHaveBeenCalled(); expect(p.planner).not.toHaveBeenCalled(); expect(p.answer).not.toHaveBeenCalled();
});
it("fails closed rather than silently omitting a stale approved turn from the context tail", async()=>{
  await db.insert(schema.messages).values({ conversationId,role: "USER",kind: "QUESTION",sequence: 1,policyVersion: "v0",approvedAt: new Date(),
    parts: [{ type: "text",text: "An older policy approved this context" }] });
  await db.update(schema.conversations).set({ nextSequence: 2 });
  const p = pipeline();
  expect(await p.execute()).toMatchObject({ kind: "DENIED",code: "SAFETY_UNAVAILABLE" });
  expect(p.provider.classify).not.toHaveBeenCalled(); expect(await db.select().from(schema.messages)).toHaveLength(1);
});
it("stops secrets in approved context before forwarding and stores only the decision for the new intent", async()=>{
  const secret = "sk-or-v1-"+"d".repeat(64);
  await db.insert(schema.messages).values({ conversationId,role: "USER",kind: "QUESTION",sequence: 1,policyVersion: "v1",approvedAt: new Date(),parts: [{ type: "text",text: secret }] });
  await db.update(schema.conversations).set({ nextSequence: 2 });
  const p = pipeline(), result = await p.execute();
  expect(result).toMatchObject({ kind: "DENIED",code: "INPUT_BLOCKED",response: { code: "REDACT_SECRET" } });
  expect(p.provider.classify).not.toHaveBeenCalled(); expect(p.planner).not.toHaveBeenCalled();
  const [review] = await db.select().from(schema.inputSafetyReviews);
  expect(review).toMatchObject({ decision: "BLOCK",categoryCodes: ["ACCIDENTAL_SECRET"],modelId: null,acceptedMessageId: null });
  expect(JSON.stringify([result,review])).not.toContain(secret);
  expect(await db.select().from(schema.messages)).toHaveLength(1);
});
it("fails closed when selecting context would discard older canonical intent", async()=>{
  await db.insert(schema.messages).values(Array.from({ length: 7 },(_,index)=>({ conversationId,role: "USER" as const,kind: "QUESTION" as const,
    sequence: index+1,policyVersion: "v1",approvedAt: new Date(),parts: [{ type: "text" as const,text: `Turn ${index}` }] })));
  await db.update(schema.conversations).set({ nextSequence: 8 });
  const p = pipeline(); expect(await p.execute()).toMatchObject({ kind: "DENIED",code: "SAFETY_UNAVAILABLE" });
  expect(p.provider.classify).not.toHaveBeenCalled(); expect(await db.select().from(schema.messages)).toHaveLength(7);
});
