import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { submissionSchema } from "@/server/contracts/chat";
import { createRunAdmission } from "@/server/runs/admit";
import { createRunExecution, type ExecutionProviders } from "@/server/runs/execute";
import { createAnswerDelivery } from "@/server/chat/delivery";
import { FREE_ADMISSION_POLICY } from "@/server/runs/policy";
import { createDocumentService } from "@/server/documents/service";
import { createMemoryDocumentStore } from "@/server/documents/storage";
import { searchDocuments } from "@/server/documents/retrieve";
import { completionSession, fakePlanner, fakeSafety, keys, knownUsage, seedCompletion } from "../helpers/completion";
import { fakeEmbeddings, fixturePdf, lexicalVector } from "../helpers/documents";

const pg = new PGlite(), db = drizzle(pg, { schema });
let person: Awaited<ReturnType<typeof seedCompletion>>, identity: { user: { id: string }; sessionId: string };
beforeAll(async () => { const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")); for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8")); });
beforeEach(async () => { await db.delete(schema.user); await db.delete(schema.operatorUsageBuckets); });
afterAll(() => pg.close());

async function asker(question: string) {
  person = await seedCompletion(db, 50000n, question, 2, undefined, "DOCUMENTS");
  identity = { user: { id: person.subject }, sessionId: (await completionSession(db, person.subject)).sessionId };
  await db.update(schema.operatorUsageBuckets).set({ providerLimitMicroUsd: 1_000_000n }).where(eq(schema.operatorUsageBuckets.budgetKey, person.operatorBudgetKey));
  return createDocumentService(db, { store: createMemoryDocumentStore(), operatorBudgetKey: person.operatorBudgetKey });
}
async function addDocument(service: ReturnType<typeof createDocumentService>, subject: string, name: string) {
  const { document } = await service.upload(subject, { title: `${name}.pdf`, bytes: await fixturePdf(name) });
  await service.embedPending(fakeEmbeddings(), { deadline: performance.now() + 20_000 });
  return document;
}
function providers(answer = "Average turbidity was 0.37 NTU [S1]."): ExecutionProviders & { search: { search: ReturnType<typeof vi.fn> }; answer: { generate: ReturnType<typeof vi.fn> } } {
  return { planner: fakePlanner(), input: fakeSafety(), query: fakeSafety(), evidence: fakeSafety(), output: fakeSafety(), embedding: fakeEmbeddings(),
    answer: { modelId: "test/answer", generate: vi.fn().mockResolvedValue({ text: answer, usage: knownUsage }) },
    search: { search: vi.fn() } } as never;
}
async function run(p: ExecutionProviders) {
  const admitted = await createRunAdmission(db, keys, { ...FREE_ADMISSION_POLICY, operatorBudgetKey: person.operatorBudgetKey }).admit(person.subject, person.request);
  if (admitted.kind === "DENIED") throw new Error("Synthetic admission missing");
  return createRunExecution(db, keys, p).execute(identity, admitted.run, submissionSchema.parse(person.request), new AbortController().signal, () => undefined);
}

describe("Files mode", () => {
  it("answers from the asker's own document with a page-level citation and never searches the web", async () => {
    const service = await asker("What was the average turbidity in the water report?");
    const document = await addDocument(service, person.subject, "water-report");
    const p = providers();
    expect(await run(p)).toEqual({ kind: "COMPLETED" });
    expect(p.search.search).not.toHaveBeenCalled();
    const [retrieval] = await db.select().from(schema.runRetrievals);
    expect(retrieval).toMatchObject({ sourceKind: "DOCUMENTS", searchCredits: null, status: "READY", modelId: "openai/text-embedding-3-small" });
    const sources = await db.select().from(schema.runSources).orderBy(schema.runSources.rank);
    expect(sources[0]).toMatchObject({ url: `https://perplexity.jacked.dev/documents/${document.id}?page=2`, title: "water-report.pdf, page 2" });
    expect((await db.select().from(schema.sourcePassages)).every(p => p.contentKind === "DOCUMENT_PAGE")).toBe(true);
    const evidence = p.answer.generate.mock.calls[0][0].evidence;
    expect(evidence.passages.find((passage: { sourceId: string }) => passage.sourceId === "S1").text).toContain("0.37 NTU");
    const calls = await db.select().from(schema.providerCalls);
    expect(calls.map(c => c.stage).sort()).toEqual(["ANSWER", "EVIDENCE_SAFETY", "INPUT_SAFETY", "OUTPUT_SAFETY", "PLANNER", "QUERY_EMBEDDING", "QUERY_SAFETY"]);
    expect(calls.find(c => c.stage === "QUERY_EMBEDDING")).toMatchObject({ status: "SUCCEEDED", capMicroUsd: 100n, costMicroUsd: 5n });
    const delivered = (await createAnswerDelivery(db).load(identity, person.runId)).answer!;
    expect(delivered.answer.sources[0]).toMatchObject({ domain: "Your files", contentKind: "DOCUMENT_PAGE", title: "water-report.pdf, page 2" });
  });

  it("never retrieves another user's documents, even for an exact match", async () => {
    const otherService = await asker("unused");
    await addDocument(otherService, person.subject, "water-report");
    const service = await asker("What was the average turbidity in the water report?");
    const p = providers("No usable evidence.");
    expect(await run(p)).toEqual({ kind: "COMPLETED" });
    expect(p.answer.generate).not.toHaveBeenCalled();
    const [retrieval] = await db.select().from(schema.runRetrievals).where(eq(schema.runRetrievals.runId, person.runId));
    expect(retrieval).toMatchObject({ status: "NO_EVIDENCE", sourceKind: "DOCUMENTS" });
    void service;
  });

  it("drops a page carrying an injection attempt from the evidence, keeping the clean pages", async () => {
    const service = await asker("What is the vendor price per unit and when is payment due?");
    await addDocument(service, person.subject, "hidden-instructions");
    const p = providers("The vendor charges INR 1,250 per unit [S1].");
    await run(p);
    const passages = await db.select().from(schema.sourcePassages);
    expect(passages.map(p => p.text).join("\n")).not.toMatch(/ignore all previous instructions/iu);
  });

  it("ignores documents that are still processing", async () => {
    const service = await asker("What was the average turbidity?");
    await service.upload(person.subject, { title: "water.pdf", bytes: await fixturePdf("water-report") });
    const p = providers();
    await run(p);
    expect((await db.select().from(schema.runRetrievals))[0].status).toBe("NO_EVIDENCE");
  });
});

describe("hybrid search", () => {
  it("fuses keyword and vector signals and keeps unrelated text out", async () => {
    const service = await asker("unused");
    await addDocument(service, person.subject, "water-report");
    await addDocument(service, person.subject, "budget-table");
    const owner = (await db.select().from(schema.appUsers).where(eq(schema.appUsers.authSubject, person.subject)))[0].id;
    const ask = async (text: string, strategy: "hybrid" | "semantic" | "keyword") => (await searchDocuments(db, owner, { text, vector: lexicalVector(text) }, strategy)).map(m => `${m.title}#${m.page}`);
    expect((await ask("membrane modules replaced", "hybrid"))[0]).toBe("water-report.pdf#3");
    expect((await ask("Which region grew fastest", "keyword"))[0]).toBe("budget-table.pdf#1");
    expect((await ask("turbidity reading", "semantic"))[0]).toBe("water-report.pdf#2");
    expect(await ask("quantum chromodynamics lattice", "hybrid")).toEqual([]);
    // Query syntax in user text is treated as words, never as tsquery operators.
    expect(await ask("!!) | & <-> :* '", "keyword")).toEqual([]);
  });
});
