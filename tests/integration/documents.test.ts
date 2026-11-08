import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createDocumentService } from "@/server/documents/service";
import { createDocumentsHttp } from "@/server/documents/http";
import { createMemoryDocumentStore } from "@/server/documents/storage";
import { DOCUMENT_LIMITS } from "@/server/documents/limits";
import { fakeEmbeddings, fixturePdf, lexicalVector } from "../helpers/documents";

const pg = new PGlite(), db = drizzle(pg, { schema });
const budgetKey = "documents-test";
let store: ReturnType<typeof createMemoryDocumentStore>, service: ReturnType<typeof createDocumentService>;
beforeAll(async () => { const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")); for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8")); });
beforeEach(async () => {
  await db.delete(schema.user); await db.delete(schema.operatorUsageBuckets);
  for (const kind of ["PERIOD", "DAY"] as const) await db.insert(schema.operatorUsageBuckets).values({ budgetKey, kind, startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000), providerLimitMicroUsd: 1_000_000n });
  store = createMemoryDocumentStore(); service = createDocumentService(db, { store, operatorBudgetKey: budgetKey });
});
afterAll(() => pg.close());
async function person() {
  const subject = randomUUID();
  await db.insert(schema.user).values({ id: subject, name: "Reader", email: `${subject}@example.test` });
  await db.insert(schema.appUsers).values({ authSubject: subject });
  return subject;
}
const settled = async () => (await db.select().from(schema.operatorUsageBuckets)).map(b => b.settledProviderMicroUsd);
const embedAll = (provider = fakeEmbeddings()) => service.embedPending(provider, { deadline: performance.now() + 20_000 });

describe("upload and embedding", () => {
  it("stores the file, chunks it by page and becomes READY once embedded, charging the real cost", async () => {
    const subject = await person();
    const { created, document } = await service.upload(subject, { title: "water-report.pdf", bytes: await fixturePdf("water-report") });
    expect(created).toBe(true);
    expect(document).toMatchObject({ title: "water-report.pdf", status: "PROCESSING", pageCount: 3, failure: null });
    expect(store.keys()).toHaveLength(1);
    const chunks = await db.select().from(schema.documentChunks);
    expect(new Set(chunks.map(c => c.page))).toEqual(new Set([1, 2, 3]));
    const provider = fakeEmbeddings({ costMicroUsd: 3n });
    expect(await embedAll(provider)).toEqual({ embedded: chunks.length, failed: 0 });
    expect(provider.calls[0][0]).toMatch(/^water-report\.pdf, page 1\n/u);
    expect((await service.list(subject))[0]).toMatchObject({ status: "READY" });
    expect((await db.select().from(schema.documents))[0]).toMatchObject({ embeddedCount: chunks.length, costMicroUsd: 3n });
    expect(await settled()).toEqual([3n, 3n]);
    expect(await db.select().from(schema.documentChunks).where(isNotNull(schema.documentChunks.leaseUntil))).toHaveLength(0);
  });
  it("charges the full cap when the provider doesn't report a cost", async () => {
    const subject = await person();
    await service.upload(subject, { title: "t.pdf", bytes: await fixturePdf("budget-table") });
    await embedAll(fakeEmbeddings({ costMicroUsd: null }));
    const [{ costMicroUsd }] = await db.select().from(schema.documents);
    expect(costMicroUsd).toBeGreaterThan(1n);
    expect(await settled()).toEqual([costMicroUsd, costMicroUsd]);
  });
  it("returns the existing document for an identical upload instead of storing it twice", async () => {
    const subject = await person(), bytes = await fixturePdf("water-report");
    const first = await service.upload(subject, { title: "a.pdf", bytes });
    const second = await service.upload(subject, { title: "b.pdf", bytes });
    expect(second).toEqual({ created: false, document: first.document });
    expect(store.keys()).toHaveLength(1);
    // Another person uploading the same file gets their own private copy.
    expect((await service.upload(await person(), { title: "a.pdf", bytes })).created).toBe(true);
  });
  it("rejects scans and enforces the per-user file limit, storing nothing", async () => {
    const subject = await person();
    await expect(service.upload(subject, { title: "s.pdf", bytes: await fixturePdf("scanned") })).rejects.toMatchObject({ code: "DOCUMENT_UNREADABLE" });
    expect(store.keys()).toHaveLength(0);
    const [owner] = await db.select().from(schema.appUsers).where(eq(schema.appUsers.authSubject, subject));
    await db.insert(schema.documents).values(Array.from({ length: DOCUMENT_LIMITS.maxDocuments }, (_, i) => ({ userId: owner.id, title: `f${i}.pdf`, contentHash: String(i).padStart(64, "0"), storageKey: `k${i}`, byteSize: 1, pageCount: 1, status: "READY", createdAt: new Date(), updatedAt: new Date() })));
    await expect(service.upload(subject, { title: "w.pdf", bytes: await fixturePdf("water-report") })).rejects.toMatchObject({ code: "DOCUMENT_LIMIT_REACHED" });
  });
  it("won't upload or embed when the shared budget can't cover it", async () => {
    const subject = await person();
    await service.upload(subject, { title: "w.pdf", bytes: await fixturePdf("water-report") });
    await db.update(schema.operatorUsageBuckets).set({ settledProviderMicroUsd: 999_999n });
    const provider = fakeEmbeddings();
    expect(await embedAll(provider)).toEqual({ embedded: 0, failed: 0 });
    expect(provider.calls).toHaveLength(0);
    expect((await db.select().from(schema.documentChunks)).every(c => c.attempts === 0 && c.leaseUntil === null)).toBe(true);
    await expect(service.upload(subject, { title: "t.pdf", bytes: await fixturePdf("budget-table") })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });
  it("retries a failed batch and marks the document FAILED after the attempt limit, keeping the cost charged", async () => {
    const subject = await person();
    await service.upload(subject, { title: "t.pdf", bytes: await fixturePdf("budget-table") });
    const outage = fakeEmbeddings({ fail: true });
    for (let attempt = 1; attempt < DOCUMENT_LIMITS.embeddingAttempts; attempt++) {
      expect(await embedAll(outage)).toMatchObject({ embedded: 0 });
      expect((await service.list(subject))[0].status).toBe("PROCESSING");
    }
    await embedAll(outage);
    expect((await service.list(subject))[0]).toMatchObject({ status: "FAILED", failure: "EMBEDDING_FAILED" });
    expect((await settled())[0]).toBeGreaterThan(0n);
    expect(await embedAll(fakeEmbeddings())).toEqual({ embedded: 0, failed: 0 });
  });
});

describe("ownership", () => {
  it("never lists, serves or deletes another user's document", async () => {
    const owner = await person(), stranger = await person();
    const { document } = await service.upload(owner, { title: "private.pdf", bytes: await fixturePdf("water-report") });
    expect(await service.list(stranger)).toEqual([]);
    await expect(service.file(stranger, document.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.remove(stranger, document.id);
    expect(await service.list(owner)).toHaveLength(1);
    expect((await service.file(owner, document.id)).bytes.length).toBe(document.byteSize);
  });
  it("deleting a document removes its chunks and stored file, and is idempotent", async () => {
    const owner = await person();
    const { document } = await service.upload(owner, { title: "w.pdf", bytes: await fixturePdf("water-report") });
    await service.remove(owner, document.id); await service.remove(owner, document.id);
    expect(await db.select().from(schema.documentChunks)).toHaveLength(0);
    expect(store.keys()).toHaveLength(0);
  });
});

describe("HTTP", () => {
  const origin = "https://perplexity.jacked.dev";
  const make = (identity: { user: { id: string; isAnonymous?: boolean }; sessionId: string } | null, enabled = true) => {
    const afterUpload = vi.fn(), consumeRequest = vi.fn(async () => undefined);
    const http = createDocumentsHttp({ identity: async () => identity, origin: () => origin, enabled: () => enabled, consumeRequest, backend: () => service, afterUpload, log: () => undefined });
    return { http, afterUpload, consumeRequest };
  };
  const upload = (bytes: Uint8Array, headers: Record<string, string> = {}) => new Request(`${origin}/api/documents`, { method: "POST", body: bytes as Uint8Array<ArrayBuffer>,
    headers: { origin, "content-type": "application/pdf", "x-file-name": encodeURIComponent("Q3 report.pdf"), ...headers } });

  it("uploads with 201, starts embedding after the response, and replays with 200", async () => {
    const subject = await person(), { http, afterUpload } = make({ user: { id: subject }, sessionId: "s" }), bytes = await fixturePdf("water-report");
    const first = await http.upload(upload(bytes));
    expect(first.status).toBe(201);
    const body = await first.json();
    expect(body.data).toMatchObject({ title: "Q3 report.pdf", status: "PROCESSING" });
    expect(first.headers.get("location")).toBe(`/api/documents/${body.data.id}`);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(afterUpload).toHaveBeenCalledWith(body.data.id);
    expect((await http.upload(upload(bytes))).status).toBe(200);
    expect(afterUpload).toHaveBeenCalledOnce();
    const listed = await (await http.list(new Request(`${origin}/api/documents`))).json();
    expect(listed).toMatchObject({ data: [{ id: body.data.id }], limits: { maxDocuments: 20, maxBytes: 10485760, maxPages: 300 } });
  });
  it("refuses guests, other origins, wrong types, oversized bodies and the disabled feature with fixed errors", async () => {
    const subject = await person(), bytes = await fixturePdf("water-report");
    const cases: [ReturnType<typeof make>, Request, number, string][] = [
      [make({ user: { id: subject, isAnonymous: true }, sessionId: "s" }), upload(bytes), 401, "UNAUTHENTICATED"],
      [make(null), upload(bytes), 401, "UNAUTHENTICATED"],
      [make({ user: { id: subject }, sessionId: "s" }), upload(bytes, { origin: "https://evil.example" }), 403, "INVALID_ORIGIN"],
      [make({ user: { id: subject }, sessionId: "s" }), upload(bytes, { "content-type": "text/plain" }), 415, "DOCUMENT_UNSUPPORTED"],
      [make({ user: { id: subject }, sessionId: "s" }), upload(bytes, { "content-length": String(DOCUMENT_LIMITS.maxBytes + 1) }), 413, "DOCUMENT_TOO_LARGE"],
      [make({ user: { id: subject }, sessionId: "s" }), upload(await fixturePdf("scanned")), 422, "DOCUMENT_UNREADABLE"],
      [make({ user: { id: subject }, sessionId: "s" }, false), upload(bytes), 404, "NOT_FOUND"],
    ];
    for (const [{ http }, request, status, code] of cases) {
      const response = await http.upload(request);
      expect([response.status, (await response.json()).error.code]).toEqual([status, code]);
    }
    expect(await db.select().from(schema.documents)).toHaveLength(0);
  });
  it("streams an oversized body only up to the limit", async () => {
    const subject = await person(), { http } = make({ user: { id: subject }, sessionId: "s" });
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulled++; controller.enqueue(new Uint8Array(1024 * 1024)); } });
    const request = new Request(`${origin}/api/documents`, { method: "POST", body, duplex: "half", headers: { origin, "content-type": "application/pdf" } } as RequestInit);
    const response = await http.upload(request);
    expect(response.status).toBe(413);
    expect(pulled).toBeLessThan(15);
  });
  it("serves the PDF inline to its owner and deletes with 204", async () => {
    const subject = await person(), { http } = make({ user: { id: subject }, sessionId: "s" });
    const { data } = await (await http.upload(upload(await fixturePdf("water-report")))).json();
    const file = await http.file(new Request(`${origin}/api/documents/${data.id}/file`), data.id);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''Q3%20report.pdf");
    expect((await file.arrayBuffer()).byteLength).toBe(data.byteSize);
    expect((await http.remove(new Request(`${origin}/api/documents/${data.id}`, { method: "DELETE", headers: { origin } }), data.id)).status).toBe(204);
    expect((await http.remove(new Request(`${origin}/api/documents/x`, { method: "DELETE", headers: { origin } }), "not-a-uuid")).status).toBe(404);
    expect((await http.file(new Request(`${origin}/api/documents/${data.id}/file`), data.id)).status).toBe(404);
  });
});

describe("review hardening", () => {
  const ownerOf = async (subject: string) => (await db.select().from(schema.appUsers).where(eq(schema.appUsers.authSubject, subject)))[0].id;
  it("enforces a daily character allowance that deleting a file doesn't refund", async () => {
    const subject = await person(), owner = await ownerOf(subject);
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(schema.documentUsage).values({ userId: owner, day: today, characters: DOCUMENT_LIMITS.dailyCharacters - 100 });
    await expect(service.upload(subject, { title: "w.pdf", bytes: await fixturePdf("water-report") })).rejects.toMatchObject({ code: "DOCUMENT_DAILY_LIMIT" });
    expect(store.keys()).toHaveLength(0);
    await db.update(schema.documentUsage).set({ characters: 1 });
    const { document } = await service.upload(subject, { title: "w.pdf", bytes: await fixturePdf("water-report") });
    const [usage] = await db.select().from(schema.documentUsage);
    expect(usage.characters).toBeGreaterThan(300);
    await service.remove(subject, document.id);
    expect((await db.select().from(schema.documentUsage))[0].characters).toBe(usage.characters);
  });
  it("never embeds below the research floor, so uploads can't pause research", async () => {
    const subject = await person();
    await service.upload(subject, { title: "t.pdf", bytes: await fixturePdf("budget-table") });
    // 100,001 left: enough for the batch alone, not for the batch plus the 100,000 floor.
    await db.update(schema.operatorUsageBuckets).set({ settledProviderMicroUsd: 899_999n });
    const provider = fakeEmbeddings();
    expect(await embedAll(provider)).toEqual({ embedded: 0, failed: 0 });
    expect(provider.calls).toHaveLength(0);
    await db.update(schema.operatorUsageBuckets).set({ settledProviderMicroUsd: 0n });
    expect((await embedAll(provider)).embedded).toBeGreaterThan(0);
  });
  it("fails a document whose attempts ran out while its workers were killed mid-batch", async () => {
    const subject = await person();
    await service.upload(subject, { title: "t.pdf", bytes: await fixturePdf("budget-table") });
    await db.update(schema.documentChunks).set({ attempts: DOCUMENT_LIMITS.embeddingAttempts, leaseUntil: new Date(Date.now() - 1000) });
    expect(await embedAll()).toEqual({ embedded: 0, failed: 0 });
    expect((await service.list(subject))[0]).toMatchObject({ status: "FAILED", failure: "EMBEDDING_FAILED" });
  });
  it("leaves a live lease alone even when its attempts are spent", async () => {
    const subject = await person();
    await service.upload(subject, { title: "t.pdf", bytes: await fixturePdf("budget-table") });
    await db.update(schema.documentChunks).set({ attempts: DOCUMENT_LIMITS.embeddingAttempts, leaseUntil: new Date(Date.now() + 60_000) });
    await embedAll();
    expect((await service.list(subject))[0].status).toBe("PROCESSING");
  });
  it("counts only vectors it actually wrote when another worker got there first", async () => {
    const subject = await person();
    const { document } = await service.upload(subject, { title: "w.pdf", bytes: await fixturePdf("water-report") });
    const chunks = await db.select().from(schema.documentChunks).orderBy(schema.documentChunks.ordinal);
    const late = fakeEmbeddings();
    // While this worker waits on the provider, another one embeds the first chunk.
    const original = late.embed.bind(late);
    late.embed = async (texts, signal) => {
      await db.update(schema.documentChunks).set({ embedding: lexicalVector("other"), embeddingModel: "other-worker" }).where(eq(schema.documentChunks.id, chunks[0].id));
      await db.update(schema.documents).set({ embeddedCount: 1 }).where(eq(schema.documents.id, document.id));
      return original(texts, signal);
    };
    const outcome = await service.embedPending(late, { deadline: performance.now() + 20_000 });
    expect(outcome).toEqual({ embedded: chunks.length, failed: 0 });
    const [row] = await db.select().from(schema.documents).where(eq(schema.documents.id, document.id));
    // Each vector is counted once, by the worker that wrote it, so the total matches and the file is READY.
    expect(row).toMatchObject({ embeddedCount: chunks.length, status: "READY" });
    expect((await db.select().from(schema.documentChunks).where(eq(schema.documentChunks.id, chunks[0].id)))[0].embeddingModel).toBe("other-worker");
  });
});
