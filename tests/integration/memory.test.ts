import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { applyOperations, deleteAllMemories, getSettings, listMemories, loadReader, memoryCount, updateSettings } from "@/server/memory/store";
import { createMemoryHttp } from "@/server/memory/http";
import { extractMemories } from "@/server/memory/run";
import { createConversationRepository } from "@/server/conversations/repository";
import { createInput } from "@/server/conversations/contracts";
import { ExtractionError, type ExtractionProvider } from "@/server/memory/extract";
import { submissionSchema, type RunMode } from "@/server/contracts/chat";
import { createRunAdmission } from "@/server/runs/admit";
import { createRunExecution, type ExecutionProviders } from "@/server/runs/execute";
import { FREE_ADMISSION_POLICY } from "@/server/runs/policy";
import { completionSession, fakePlanner, fakeSafety, keys, knownUsage } from "../helpers/completion";

const pg = new PGlite(), db = drizzle(pg, { schema });
beforeAll(async () => { const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")); for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8")); });
beforeEach(async () => { await db.delete(schema.user); await db.delete(schema.operatorUsageBuckets); });
afterAll(() => pg.close());

async function person(options: { guest?: boolean; temporary?: boolean } = {}) {
  const subject = randomUUID();
  await db.insert(schema.user).values({ id: subject, name: "Reader", email: `${subject}@example.test`, isAnonymous: options.guest ?? false });
  const [profile] = await db.insert(schema.appUsers).values({ authSubject: subject }).returning();
  const [conversation] = await db.insert(schema.conversations).values({ userId: profile.id, creationRequestId: randomUUID(), creationFingerprint: "synthetic", title: "Memory", memoryEnabled: !options.temporary }).returning();
  return { subject, userId: profile.id, conversationId: conversation.id };
}
const add = (text: string, kind: "PROFILE" | "PREFERENCE" | "CONTEXT" = "PROFILE") => ({ op: "ADD" as const, kind, text });

describe("memory settings", () => {
  it("starts unpaused with no About you, and saves both lazily", async () => {
    const who = await person();
    expect(await getSettings(db, who.subject)).toEqual({ paused: false, instructions: null });
    expect(await updateSettings(db, who.subject, { instructions: "  Civil engineer. Metric units.  " })).toEqual({ paused: false, instructions: "Civil engineer. Metric units." });
    expect(await updateSettings(db, who.subject, { paused: true })).toEqual({ paused: true, instructions: "Civil engineer. Metric units." });
    expect(await updateSettings(db, who.subject, { instructions: "   " })).toEqual({ paused: true, instructions: null });
  });

  it("refuses guests and unknown people", async () => {
    const guest = await person({ guest: true });
    await expect(getSettings(db, guest.subject)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(deleteAllMemories(db, randomUUID())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("deletes every memory, keeps About you, and is idempotent", async () => {
    const who = await person(), other = await person();
    await updateSettings(db, who.subject, { instructions: "Keep it short" });
    await applyOperations(db, who.userId, [add("Works as a civil engineer"), add("Lives in Pune")], null);
    await applyOperations(db, other.userId, [add("Lives in Delhi")], null);
    expect(await deleteAllMemories(db, who.subject)).toBe(2);
    expect(await deleteAllMemories(db, who.subject)).toBe(0);
    expect(await memoryCount(db, other.userId)).toBe(1);
    expect((await getSettings(db, who.subject)).instructions).toBe("Keep it short");
  });
});

describe("applying memory operations", () => {
  it("adds, updates and deletes only the owner's memories, and skips duplicates", async () => {
    const who = await person(), other = await person();
    await applyOperations(db, other.userId, [add("Lives in Delhi")], null);
    const [foreign] = await listMemories(db, other.userId);
    expect(await applyOperations(db, who.userId, [add("Lives in Pune"), add("  lives   in pune "), add("Prefers metric units", "PREFERENCE")], null)).toBe(2);
    const pune = (await listMemories(db, who.userId)).find(m => m.text === "Lives in Pune")!;
    expect(await applyOperations(db, who.userId, [{ op: "UPDATE", id: pune.id, text: "Lives in Bengaluru" }, { op: "DELETE", id: foreign.id }, { op: "UPDATE", id: foreign.id, text: "Lives in Mumbai" }], null)).toBe(1);
    expect((await listMemories(db, who.userId)).map(m => m.text).sort()).toEqual(["Lives in Bengaluru", "Prefers metric units"]);
    expect((await listMemories(db, other.userId)).map(m => m.text)).toEqual(["Lives in Delhi"]);
    expect(await applyOperations(db, who.userId, [{ op: "UPDATE", id: pune.id, text: "prefers METRIC units" }], null)).toBe(0);
  });

  it("lets a pause or Delete all win over an extraction that started earlier", async () => {
    const who = await person();
    const startedAt = new Date(Date.now() - 5000);
    await db.insert(schema.memorySettings).values({ userId: who.userId, updatedAt: new Date(Date.now() - 10000) });
    expect(await applyOperations(db, who.userId, [add("Lives in Pune")], null, startedAt)).toBe(1);
    await deleteAllMemories(db, who.subject);
    expect(await applyOperations(db, who.userId, [add("Works as a civil engineer")], null, startedAt)).toBe(0);
    expect(await memoryCount(db, who.userId)).toBe(0);
    expect(await applyOperations(db, who.userId, [add("Works as a civil engineer")], null, new Date())).toBe(1);
  });

  it("saves nothing while paused", async () => {
    const who = await person();
    await updateSettings(db, who.subject, { paused: true });
    expect(await applyOperations(db, who.userId, [add("Lives in Pune")], null)).toBe(0);
    expect(await memoryCount(db, who.userId)).toBe(0);
  });

  it("keeps at most 50, evicting the oldest ongoing context first, even when two answers finish together", async () => {
    const who = await person();
    await applyOperations(db, who.userId, [add("Planning a Sedona launch", "CONTEXT")], null);
    for (let i = 0; i < 49; i++) await applyOperations(db, who.userId, [add(`Profile fact number ${i}`)], null);
    await Promise.all([applyOperations(db, who.userId, [add("Learning Rust", "CONTEXT")], null), applyOperations(db, who.userId, [add("Prefers tables", "PREFERENCE")], null)]);
    const texts = (await listMemories(db, who.userId)).map(m => m.text);
    expect(texts).toHaveLength(50);
    expect(texts).not.toContain("Planning a Sedona launch");
    // Context always goes first, so which other memory survives depends on which answer finished first.
    expect(texts).toContain("Prefers tables");
  });

  it("keeps memories when the conversation they came from is deleted", async () => {
    const who = await person();
    const [message] = await db.insert(schema.messages).values({ conversationId: who.conversationId, sequence: 1, role: "USER", kind: "QUESTION", parts: [{ type: "text", text: "I live in Pune" }] }).returning();
    await applyOperations(db, who.userId, [add("Lives in Pune")], message.id);
    await db.delete(schema.conversations).where(eq(schema.conversations.id, who.conversationId));
    const [kept] = await db.select().from(schema.memories).where(eq(schema.memories.userId, who.userId));
    expect(kept).toMatchObject({ text: "Lives in Pune", sourceMessageId: null });
  });
});

describe("what an answer may know about the asker", () => {
  it("gives About you, then preferences, profile and context, within 2,000 characters", async () => {
    const who = await person();
    await updateSettings(db, who.subject, { instructions: "Civil engineer" });
    await applyOperations(db, who.userId, [add("Planning a Sedona launch", "CONTEXT"), add("Lives in Pune"), add("Prefers short answers", "PREFERENCE")], null);
    expect(await loadReader(db, who.userId, who.conversationId)).toEqual({ instructions: "Civil engineer", memories: ["Prefers short answers", "Lives in Pune", "Planning a Sedona launch"], learning: true });
    const fresh = await person();
    expect(await loadReader(db, fresh.userId, fresh.conversationId)).toEqual({ memories: [], learning: true });
  });

  it("gives nothing for temporary chats, guests or another person's conversation, and only About you while paused", async () => {
    const who = await person(), temporary = await person({ temporary: true }), guest = await person({ guest: true });
    for (const p of [who, temporary, guest]) await applyOperations(db, p.userId, [add("Lives in Pune")], null);
    expect(await loadReader(db, temporary.userId, temporary.conversationId)).toBeNull();
    expect(await loadReader(db, guest.userId, guest.conversationId)).toBeNull();
    expect(await loadReader(db, who.userId, temporary.conversationId)).toBeNull();
    await updateSettings(db, who.subject, { paused: true });
    expect(await loadReader(db, who.userId, who.conversationId)).toBeNull();
    await updateSettings(db, who.subject, { instructions: "Use metric units" });
    expect(await loadReader(db, who.userId, who.conversationId)).toEqual({ instructions: "Use metric units", memories: [] });
  });
});

describe("memory settings API", () => {
  const origin = "https://perplex.test";
  function api(who: { subject: string } | null, guest = false) {
    const consumeRequest = async () => undefined;
    return createMemoryHttp({ identity: async () => who ? { user: { id: who.subject, isAnonymous: guest }, sessionId: "s" } as never : null, origin: () => origin, consumeRequest,
      backend: () => ({ settings: s => getSettings(db, s), update: (s, p) => updateSettings(db, s, p), deleteAll: s => deleteAllMemories(db, s) }), log: () => undefined });
  }
  const patch = (body: unknown, extra: Record<string, string> = {}) => new Request(`${origin}/api/memory`, { method: "PATCH", headers: { origin, "content-type": "application/json", ...extra }, body: typeof body === "string" ? body : JSON.stringify(body) });

  it("reads, updates and deletes the signed-in person's memory settings", async () => {
    const who = await person(), http = api(who);
    expect(await (await http.read(new Request(`${origin}/api/memory`))).json()).toEqual({ data: { paused: false, instructions: null } });
    const updated = await http.update(patch({ paused: true, instructions: "Metric units" }));
    expect(updated.status).toBe(200);
    expect(updated.headers.get("cache-control")).toBe("private, no-store");
    expect(await updated.json()).toEqual({ data: { paused: true, instructions: "Metric units" } });
    await applyOperations(db, who.userId, [add("Lives in Pune")], null);
    await updateSettings(db, who.subject, { paused: false });
    await applyOperations(db, who.userId, [add("Lives in Pune")], null);
    const removed = await http.deleteAll(new Request(`${origin}/api/memory`, { method: "DELETE", headers: { origin } }));
    expect(await removed.json()).toEqual({ data: { deleted: 1 } });
  });

  it("refuses guests, strangers, foreign origins and malformed changes", async () => {
    const who = await person();
    expect((await api(null).read(new Request(`${origin}/api/memory`))).status).toBe(401);
    expect((await api(who, true).read(new Request(`${origin}/api/memory`))).status).toBe(401);
    expect((await api(who).update(patch({ paused: true }, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await api(who).deleteAll(new Request(`${origin}/api/memory`, { method: "DELETE" }))).status).toBe(403);
    for (const body of [{}, { paused: "yes" }, { instructions: "x".repeat(1001) }, { paused: true, extra: 1 }, "not json"]) {
      expect((await api(who).update(patch(body))).status).toBe(422);
    }
    expect((await api(who).update(new Request(`${origin}/api/memory`, { method: "PATCH", headers: { origin, "content-type": "text/plain" }, body: "{}" }))).status).toBe(422);
    expect(await getSettings(db, who.subject)).toEqual({ paused: false, instructions: null });
  });
});

describe("answers with memory", () => {
  // A signed-in person with budget for a few answers, asking in a conversation of their own.
  async function asker(temporary = false) {
    const who = await person({ temporary }), budgetKey = `memory-${randomUUID()}`;
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, who.subject));
    for (const kind of ["PERIOD", "DAY"] as const) {
      const window = { startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000) };
      await db.insert(schema.usageBuckets).values({ userId: who.userId, kind, ...window, entitlementVersion: "test-v1", creditLimit: 20, providerLimitMicroUsd: 1_000_000n });
      await db.insert(schema.operatorUsageBuckets).values({ budgetKey, kind, ...window, providerLimitMicroUsd: 1_000_000n });
    }
    const identity = { user: { id: who.subject }, sessionId: (await completionSession(db, who.subject)).sessionId };
    return { ...who, identity, admission: createRunAdmission(db, keys, { ...FREE_ADMISSION_POLICY, operatorBudgetKey: budgetKey }) };
  }
  function providers(text = "Suppliers in the area [S1].", memory?: ExtractionProvider) {
    const pending: Promise<void>[] = [];
    return { pending, ...(memory ? { memory: { provider: memory, schedule: (work: () => Promise<void>) => { pending.push(work()); } } } : {}), planner: { ...fakePlanner(), plan: vi.fn(fakePlanner().plan) }, input: fakeSafety(), query: fakeSafety(), evidence: fakeSafety(), output: fakeSafety(),
      answer: { modelId: "test/answer", generate: vi.fn().mockResolvedValue({ text, usage: knownUsage }) },
      search: { search: vi.fn().mockResolvedValue({ results: [{ title: "Suppliers", url: "https://example.org/s", content: "Concrete suppliers list.", score: 0.9 }], credits: 1 }) } };
  }
  async function ask(who: Awaited<ReturnType<typeof asker>>, text: string, mode: RunMode, p = providers()) {
    const input = { conversationId: who.conversationId, clientRequestId: randomUUID(), expectedRevision: 0, mode, modelKey: "fast-default", message: { text } };
    const admitted = await who.admission.admit(who.subject, input);
    if (admitted.kind === "DENIED") throw new Error(admitted.code);
    const result = await createRunExecution(db, keys, p as unknown as ExecutionProviders).execute(who.identity, admitted.run, submissionSchema.parse(input), new AbortController().signal, () => undefined);
    return { result, p };
  }
  const seen = (p: ReturnType<typeof providers>) => JSON.stringify([p.planner.plan.mock.calls, p.search.search.mock.calls]);

  it("gives Web and Chat answers the asker's memories, and never the planner or search", async () => {
    const who = await asker();
    await updateSettings(db, who.subject, { instructions: "Answer in metric units" });
    await applyOperations(db, who.userId, [add("Lives in Pune")], null);
    const web = await ask(who, "Concrete suppliers near me", "FAST");
    expect(web.result).toMatchObject({ kind: "COMPLETED" });
    expect(web.p.answer.generate.mock.calls[0][0].reader).toEqual({ instructions: "Answer in metric units", memories: ["Lives in Pune"], learning: true });
    expect(seen(web.p)).not.toMatch(/Pune|metric/u);
    const other = await asker();
    await applyOperations(db, other.userId, [add("Prefers short answers", "PREFERENCE")], null);
    const chat = await ask(other, "Explain recursion", "CHAT", providers("A function that calls itself."));
    expect(chat.result).toMatchObject({ kind: "COMPLETED" });
    // "Explain recursion" says nothing about the asker, so the answer uses memories but promises nothing.
    expect(chat.p.answer.generate.mock.calls[0][0].reader).toEqual({ memories: ["Prefers short answers"] });
  });

  it("only promises to remember when the message will be learned from", async () => {
    const who = await asker();
    const personal = await ask(who, "I'm a civil engineer, which concrete suppliers are good?", "FAST");
    expect(personal.p.answer.generate.mock.calls[0][0].reader).toEqual({ memories: [], learning: true });
    const other = await asker();
    const impersonal = await ask(other, "Concrete suppliers in Pune", "FAST");
    expect(impersonal.p.answer.generate.mock.calls[0][0]).not.toHaveProperty("reader");
  });

  it("gives nothing when memory is paused or the chat is temporary", async () => {
    const paused = await asker(), temporary = await asker(true);
    for (const who of [paused, temporary]) await applyOperations(db, who.userId, [add("Lives in Pune")], null);
    await updateSettings(db, paused.subject, { paused: true });
    for (const who of [paused, temporary]) {
      const { result, p } = await ask(who, "Concrete suppliers near me", "FAST");
      expect(result).toMatchObject({ kind: "COMPLETED" });
      expect(p.answer.generate.mock.calls[0][0]).not.toHaveProperty("reader");
    }
  });
});

describe("saving memories after an answer", () => {
  async function asker(temporary = false) {
    const who = await person({ temporary }), budgetKey = `memory-${randomUUID()}`;
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, who.subject));
    for (const kind of ["PERIOD", "DAY"] as const) {
      const window = { startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000) };
      await db.insert(schema.usageBuckets).values({ userId: who.userId, kind, ...window, entitlementVersion: "test-v1", creditLimit: 20, providerLimitMicroUsd: 1_000_000n });
      await db.insert(schema.operatorUsageBuckets).values({ budgetKey, kind, ...window, providerLimitMicroUsd: 1_000_000n });
    }
    const identity = { user: { id: who.subject }, sessionId: (await completionSession(db, who.subject)).sessionId };
    return { ...who, identity, revision: 0, admission: createRunAdmission(db, keys, { ...FREE_ADMISSION_POLICY, operatorBudgetKey: budgetKey }) };
  }
  type Asker = Awaited<ReturnType<typeof asker>>;
  const extractor = (operations: unknown[] | Error = []) => ({ modelId: "test/memory", usage: () => knownUsage,
    extract: vi.fn(async () => { if (operations instanceof Error) throw operations; return { operations, usage: knownUsage }; }) }) as unknown as ExtractionProvider & { extract: ReturnType<typeof vi.fn> };
  async function ask(who: Asker, text: string, memory: ExtractionProvider, mode: RunMode = "CHAT") {
    const input = { conversationId: who.conversationId, clientRequestId: randomUUID(), expectedRevision: who.revision, mode, modelKey: "fast-default", message: { text } };
    const admitted = await who.admission.admit(who.subject, input);
    if (admitted.kind === "DENIED") throw new Error(admitted.code);
    const p = { planner: fakePlanner(), input: fakeSafety(), query: fakeSafety(), evidence: fakeSafety(), output: fakeSafety(), search: { search: vi.fn() },
      answer: { modelId: "test/answer", generate: vi.fn().mockResolvedValue({ text: "Here is an answer.", usage: knownUsage }) },
      memory: { provider: memory, schedule: (work: () => Promise<void>) => { pending.push(work()); } } };
    const pending: Promise<void>[] = [];
    const result = await createRunExecution(db, keys, p as unknown as ExecutionProviders).execute(who.identity, admitted.run, submissionSchema.parse(input), new AbortController().signal, () => undefined);
    await Promise.all(pending);
    who.revision = (await db.select().from(schema.conversations).where(eq(schema.conversations.id, who.conversationId)))[0].revision;
    return { result, runId: admitted.run.id };
  }
  const ledger = (runId: string) => db.select().from(schema.memoryExtractions).where(eq(schema.memoryExtractions.runId, runId));
  const texts = async (userId: string) => (await listMemories(db, userId)).map(m => m.text).sort();

  it("saves what the asker states about themselves, after the answer, and records its cost apart from the run", async () => {
    const who = await asker(), memory = extractor([{ op: "ADD", kind: "PROFILE", text: "Works as a civil engineer" }, { op: "ADD", kind: "PROFILE", text: "Lives in Pune" }]);
    const { result, runId } = await ask(who, "I'm a civil engineer in Pune, what's the M25 mix ratio?", memory);
    expect(result).toMatchObject({ kind: "COMPLETED" });
    expect(await texts(who.userId)).toEqual(["Lives in Pune", "Works as a civil engineer"]);
    expect(await ledger(runId)).toMatchObject([{ status: "SUCCEEDED", model: "test/memory", costMicroUsd: knownUsage.costMicroUsd, operations: 2 }]);
    const stages = (await db.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId, runId))).map(c => c.stage);
    expect(stages).not.toContain("MEMORY_EXTRACTION");
    expect(memory.extract.mock.calls[0][0]).toEqual({ message: "I'm a civil engineer in Pune, what's the M25 mix ratio?", memories: [] });
  });

  it("updates and forgets through what the asker says, and drops invented or sensitive facts", async () => {
    const who = await asker();
    await applyOperations(db, who.userId, [add("Lives in Pune"), add("Eats fish", "PREFERENCE")], null);
    const [fish, pune] = await listMemories(db, who.userId);
    const memory = extractor([{ op: "UPDATE", id: pune.id, text: "Lives in Bengaluru" }, { op: "DELETE", id: fish.id }, { op: "ADD", kind: "PROFILE", text: "Was diagnosed with anxiety" }]);
    const { runId } = await ask(who, "I moved to Bengaluru, and forget that I eat fish. My anxiety is better too.", memory);
    expect(await texts(who.userId)).toEqual(["Lives in Bengaluru"]);
    expect(await ledger(runId)).toMatchObject([{ status: "SUCCEEDED", operations: 2 }]);
    const invented = extractor([{ op: "ADD", kind: "CONTEXT", text: "Is planning a wedding in Goa" }]);
    await ask(who, "I need concrete suppliers", invented);
    expect(await texts(who.userId)).toEqual(["Lives in Bengaluru"]);
  });

  it("makes no call for impersonal questions, paused memory or temporary chats", async () => {
    const who = await asker(), temporary = await asker(true), paused = await asker();
    await updateSettings(db, paused.subject, { paused: true });
    for (const [person, text] of [[who, "What is the GDP of India?"], [temporary, "I live in Pune, any suppliers?"], [paused, "I live in Pune, any suppliers?"]] as const) {
      const memory = extractor([{ op: "ADD", kind: "PROFILE", text: "Lives in Pune" }]);
      const { result, runId } = await ask(person, text, memory);
      expect(result).toMatchObject({ kind: "COMPLETED" });
      expect(memory.extract).not.toHaveBeenCalled();
      expect(await ledger(runId)).toEqual([]);
    }
  });

  it("writes nothing when Delete all lands while an extraction is in flight", async () => {
    const who = await asker();
    const memory = extractor([{ op: "ADD", kind: "PROFILE", text: "Lives in Pune" }]);
    memory.extract.mockImplementationOnce(async () => { await new Promise(resolve => setTimeout(resolve, 5)); await deleteAllMemories(db, who.subject); return { operations: [{ op: "ADD", kind: "PROFILE", text: "Lives in Pune" }], usage: knownUsage }; });
    const { runId } = await ask(who, "I live in Pune, any suppliers?", memory);
    expect(await texts(who.userId)).toEqual([]);
    expect(await ledger(runId)).toMatchObject([{ status: "SUCCEEDED", operations: 0 }]);
  });

  it("never lets a failed extraction touch the answer, and runs once per run and within the daily limit", async () => {
    const who = await asker(), failing = extractor(new ExtractionError("TIMEOUT"));
    const { result, runId } = await ask(who, "I live in Pune, any suppliers?", failing);
    expect(result).toMatchObject({ kind: "COMPLETED" });
    expect(await ledger(runId)).toMatchObject([{ status: "FAILED", costMicroUsd: knownUsage.costMicroUsd, operations: 0 }]);
    const again = extractor([{ op: "ADD", kind: "PROFILE", text: "Lives in Pune" }]);
    await extractMemories(db, runId, again, { log: () => undefined });
    expect(again.extract).not.toHaveBeenCalled();
    const next = await ask(who, "I work in construction, what about M30?", extractor());
    expect(await ledger(next.runId)).toHaveLength(1);
    const capped = extractor([{ op: "ADD", kind: "PROFILE", text: "Works in construction" }]);
    await db.delete(schema.memoryExtractions).where(eq(schema.memoryExtractions.runId, next.runId));
    const log = vi.fn();
    await extractMemories(db, next.runId, capped, { dailyLimit: 1, log });
    expect(capped.extract).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ outcome: "SKIPPED", reason: "DAILY_LIMIT" }));
  });
});

describe("temporary chats", () => {
  it("are chosen only when the conversation is created, and replays can't flip the choice", async () => {
    const who = await person(), repository = createConversationRepository(db), clientRequestId = randomUUID();
    const temporary = await repository.create(who.subject, createInput.parse({ clientRequestId, title: "New search", memory: false }));
    expect(temporary).toMatchObject({ created: true, conversation: { memoryEnabled: false } });
    expect(await repository.create(who.subject, createInput.parse({ clientRequestId, title: "New search", memory: false }))).toMatchObject({ created: false, conversation: { memoryEnabled: false } });
    await expect(repository.create(who.subject, createInput.parse({ clientRequestId, title: "New search" }))).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
    expect((await repository.create(who.subject, createInput.parse({ clientRequestId: randomUUID(), title: "New search" }))).conversation.memoryEnabled).toBe(true);
    expect((await repository.history(who.subject, temporary.conversation.id, { limit: 20 })).conversation).toMatchObject({ memoryEnabled: false });
    expect(createInput.safeParse({ clientRequestId, memory: true }).success).toBe(false);
  });
});
