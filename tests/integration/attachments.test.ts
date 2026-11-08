import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { submissionSchema, type RunMode } from "@/server/contracts/chat";
import { createRunAdmission } from "@/server/runs/admit";
import { createRunExecution, type ExecutionProviders } from "@/server/runs/execute";
import { FREE_ADMISSION_POLICY } from "@/server/runs/policy";
import { createDocumentService } from "@/server/documents/service";
import { createMemoryDocumentStore } from "@/server/documents/storage";
import { createConversationRepository } from "@/server/conversations/repository";
import { completionSession, fakePlanner, fakeSafety, keys, knownUsage } from "../helpers/completion";
import { fakeEmbeddings, fixturePdf } from "../helpers/documents";

const pg = new PGlite(), db = drizzle(pg, { schema });
beforeAll(async () => { const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")); for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8")); });
beforeEach(async () => { await db.delete(schema.user); await db.delete(schema.operatorUsageBuckets); });
afterAll(() => pg.close());

// A signed-in person with an empty conversation and room for two answers.
async function person() {
  const subject = randomUUID(), budgetKey = `attachments-${randomUUID()}`;
  await db.insert(schema.user).values({ id: subject, name: "Reader", email: `${subject}@example.test` });
  const [profile] = await db.insert(schema.appUsers).values({ authSubject: subject }).returning();
  const [conversation] = await db.insert(schema.conversations).values({ userId: profile.id, creationRequestId: randomUUID(), creationFingerprint: "synthetic", title: "Attachments" }).returning();
  for (const kind of ["PERIOD", "DAY"] as const) {
    const window = { startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000) };
    await db.insert(schema.usageBuckets).values({ userId: profile.id, kind, ...window, entitlementVersion: "test-v1", creditLimit: 20, providerLimitMicroUsd: 1_000_000n });
    await db.insert(schema.operatorUsageBuckets).values({ budgetKey, kind, ...window, providerLimitMicroUsd: 1_000_000n });
  }
  const service = createDocumentService(db, { store: createMemoryDocumentStore(), operatorBudgetKey: budgetKey });
  const identity = { user: { id: subject }, sessionId: (await completionSession(db, subject)).sessionId };
  const admission = createRunAdmission(db, keys, { ...FREE_ADMISSION_POLICY, operatorBudgetKey: budgetKey });
  return { subject, profile, conversation, service, identity, admission };
}
type Person = Awaited<ReturnType<typeof person>>;
async function addDocument(who: Person, name: string) {
  const { document } = await who.service.upload(who.subject, { title: `${name}.pdf`, bytes: await fixturePdf(name) });
  await who.service.embedPending(fakeEmbeddings(), { deadline: performance.now() + 20_000 });
  return document;
}
const request = (who: Person, text: string, mode: RunMode, documentIds?: string[], expectedRevision = 0) =>
  ({ conversationId: who.conversation.id, clientRequestId: randomUUID(), expectedRevision, mode, modelKey: "fast-default", message: { text }, ...(documentIds ? { documentIds } : {}) });
function providers(web: { title: string; url: string; content: string }[] = []) {
  return { planner: fakePlanner(), input: fakeSafety(), query: fakeSafety(), evidence: fakeSafety(), output: fakeSafety(), embedding: fakeEmbeddings(),
    answer: { modelId: "test/answer", generate: vi.fn().mockResolvedValue({ text: "From the file [S1].", usage: knownUsage }) },
    search: { search: vi.fn().mockResolvedValue({ results: web.map(result => ({ ...result, score: 0.9 })), credits: 1 }) } } as unknown as ExecutionProviders & { search: { search: ReturnType<typeof vi.fn> }; answer: { generate: ReturnType<typeof vi.fn> } };
}
async function ask(who: Person, input: ReturnType<typeof request>, p = providers()) {
  const admitted = await who.admission.admit(who.subject, input);
  if (admitted.kind === "DENIED") return admitted;
  const result = await createRunExecution(db, keys, p).execute(who.identity, admitted.run, submissionSchema.parse(input), new AbortController().signal, () => undefined);
  return { ...result, runId: admitted.run.id };
}
const sourcesOf = async (runId: string) => (await db.select().from(schema.runSources).where(eq(schema.runSources.runId, runId)).orderBy(schema.runSources.rank)).map(s => s.title);

describe("attaching files to a question", () => {
  it("Chat with a file answers only from that file, even when another file matches better", async () => {
    const who = await person();
    await addDocument(who, "water-report");
    const budget = await addDocument(who, "budget-table");
    const p = providers();
    const result = await ask(who, request(who, "What was the average turbidity?", "CHAT", [budget.id]), p);
    expect(result).toMatchObject({ kind: "COMPLETED" });
    const runId = (result as { runId: string }).runId;
    expect(p.search.search).not.toHaveBeenCalled();
    expect((await db.select().from(schema.runs).where(eq(schema.runs.id, runId)))[0].mode).toBe("DOCUMENTS");
    expect(await db.select({ documentId: schema.runDocuments.documentId, position: schema.runDocuments.position }).from(schema.runDocuments)).toEqual([{ documentId: budget.id, position: 0 }]);
    const titles = await sourcesOf(runId);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every(title => title.startsWith("budget-table.pdf"))).toBe(true);
    expect((await db.select().from(schema.runRetrievals).where(eq(schema.runRetrievals.runId, runId)))[0]).toMatchObject({ sourceKind: "DOCUMENTS", searchCredits: null });
  });

  it("a request to summarize an attached file finds its opening pages without matching words", async () => {
    const who = await person();
    const water = await addDocument(who, "water-report");
    const result = await ask(who, request(who, "Summarize this", "CHAT", [water.id]));
    expect(result).toMatchObject({ kind: "COMPLETED" });
    expect(await sourcesOf((result as { runId: string }).runId)).toContain("water-report.pdf, page 1");
  });

  it("Web with a file mixes file pages with web results and spends search credits", async () => {
    const who = await person();
    const water = await addDocument(who, "water-report");
    const p = providers([{ title: "WHO turbidity guidance", url: "https://example.org/turbidity", content: "Drinking water turbidity should stay below 1 NTU." }]);
    const result = await ask(who, request(who, "Is the average turbidity in the water report within guidelines?", "FAST", [water.id]), p);
    expect(result).toMatchObject({ kind: "COMPLETED" });
    const runId = (result as { runId: string }).runId;
    expect(p.search.search).toHaveBeenCalled();
    const titles = await sourcesOf(runId);
    expect(titles).toContain("WHO turbidity guidance");
    expect(titles.some(title => title.startsWith("water-report.pdf"))).toBe(true);
    expect((await db.select().from(schema.runRetrievals).where(eq(schema.runRetrievals.runId, runId)))[0]).toMatchObject({ sourceKind: "WEB", searchCredits: 1 });
    const kinds = (await db.select().from(schema.sourcePassages).where(eq(schema.sourcePassages.runId, runId))).map(p => p.contentKind);
    expect(new Set(kinds)).toEqual(new Set(["DOCUMENT_PAGE", "SEARCH_PASSAGE"]));
  });

  it("refuses a file that is still processing, belongs to someone else or doesn't exist, without reserving anything", async () => {
    const who = await person(), other = await person();
    const theirs = await addDocument(other, "water-report");
    const { document: pending } = await who.service.upload(who.subject, { title: "water.pdf", bytes: await fixturePdf("water-report") });
    for (const ids of [[pending.id], [theirs.id], [randomUUID()]])
      expect(await ask(who, request(who, "What was the turbidity?", "CHAT", ids))).toEqual({ kind: "DENIED", code: "DOCUMENT_NOT_READY" });
    expect(await db.select().from(schema.runs).where(eq(schema.runs.userId, who.profile.id))).toHaveLength(0);
    expect(await db.select().from(schema.runDocuments)).toHaveLength(0);
  });

  it("rejects duplicate or too many files, and treats a changed file list as a different request", async () => {
    const who = await person();
    const water = await addDocument(who, "water-report");
    await expect(who.admission.admit(who.subject, request(who, "Q", "CHAT", [water.id, water.id]))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(who.admission.admit(who.subject, request(who, "Q", "CHAT", Array.from({ length: 6 }, () => randomUUID())))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const first = request(who, "What was the turbidity?", "CHAT", [water.id]);
    expect((await who.admission.admit(who.subject, first)).kind).toBe("ADMITTED");
    const withoutFiles = { ...first, documentIds: undefined };
    expect(await who.admission.admit(who.subject, withoutFiles)).toEqual({ kind: "DENIED", code: "IDEMPOTENCY_MISMATCH" });
  });

  it("history shows which files a question was asked with, until a file is deleted", async () => {
    const who = await person();
    const water = await addDocument(who, "water-report");
    const result = await ask(who, request(who, "What was the average turbidity?", "CHAT", [water.id]));
    expect(result).toMatchObject({ kind: "COMPLETED" });
    const history = () => createConversationRepository(db).history(who.subject, who.conversation.id, { limit: 50 });
    const question = (await history()).items.find(item => item.role === "USER")!;
    expect(question).toMatchObject({ attachments: [{ id: water.id, title: "water-report.pdf" }] });
    expect((await history()).items.find(item => item.role === "ASSISTANT")).not.toHaveProperty("attachments");
    await who.service.remove(who.subject, water.id);
    expect((await history()).items.find(item => item.role === "USER")).not.toHaveProperty("attachments");
  });
});
