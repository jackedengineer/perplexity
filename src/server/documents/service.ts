import { createHash, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { appUsers, documentChunks, documents, documentUsage, operatorUsageBuckets } from "@/db/schema";
import { AdmissionError } from "@/server/runs/errors";
import { researchAvailable } from "@/server/runs/availability";
import type { AdmissionDatabase } from "@/server/runs/usage";
import { chunkPages } from "./chunk";
import { embeddingCapMicroUsd, type EmbeddingProvider } from "./embedding";
import { DOCUMENT_LIMITS, DocumentError } from "./limits";
import { parsePdf } from "./parse";
import { documentStorageKey, type DocumentStore } from "./storage";

export type DocumentView = {
  id: string; title: string; status: "PROCESSING" | "READY" | "FAILED"; pageCount: number; byteSize: number;
  createdAt: string; failure: "UNREADABLE" | "EMBEDDING_FAILED" | null;
};
type DocumentRow = typeof documents.$inferSelect;
const view = (row: DocumentRow): DocumentView => ({
  id: row.id, title: row.title, status: row.status as DocumentView["status"], pageCount: row.pageCount, byteSize: row.byteSize,
  createdAt: row.createdAt.toISOString(), failure: row.failureCode as DocumentView["failure"],
});
const utcDay = (at: Date) => at.toISOString().slice(0, 10);

// Titles are display text only: no path, no control characters, bounded length.
export function documentTitle(name: string | null) {
  let decoded = name ?? "";
  try { decoded = decodeURIComponent(decoded); } catch { /* Keep the raw header text. */ }
  const base = decoded.split(/[\\/]/u).pop() ?? "";
  const clean = base.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/gu, " ").trim();
  const bounded = [...clean].slice(0, DOCUMENT_LIMITS.maxTitleCharacters).join("");
  return bounded || "Document.pdf";
}

type Dependencies = { store: DocumentStore; operatorBudgetKey: string; now?: () => Date };

export function createDocumentService(db: AdmissionDatabase, dependencies: Dependencies) {
  const now = () => dependencies.now?.() ?? new Date();
  async function ownerId(subject: string) {
    const [owner] = await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.authSubject, subject));
    if (!owner) throw new AdmissionError("UNAUTHENTICATED");
    return owner.id;
  }

  return {
    async list(subject: string): Promise<DocumentView[]> {
      const owner = await ownerId(subject);
      const rows = await db.select().from(documents).where(eq(documents.userId, owner)).orderBy(desc(documents.createdAt)).limit(DOCUMENT_LIMITS.maxDocuments);
      return rows.map(view);
    },

    // Returns the existing document for an identical file, so a retried upload is harmless.
    async upload(subject: string, input: { title: string; bytes: Uint8Array }): Promise<{ created: boolean; document: DocumentView }> {
      const owner = await ownerId(subject), day = utcDay(now());
      const contentHash = createHash("sha256").update(input.bytes).digest("hex");
      const [found] = await db.select().from(documents).where(and(eq(documents.userId, owner), eq(documents.contentHash, contentHash)));
      if (found) return { created: false, document: view(found) };
      const [{ total }] = await db.select({ total: count() }).from(documents).where(eq(documents.userId, owner));
      if (total >= DOCUMENT_LIMITS.maxDocuments) throw new DocumentError("DOCUMENT_LIMIT_REACHED");
      const [usage] = await db.select().from(documentUsage).where(and(eq(documentUsage.userId, owner), eq(documentUsage.day, day)));
      if ((usage?.characters ?? 0) >= DOCUMENT_LIMITS.dailyCharacters) throw new DocumentError("DOCUMENT_DAILY_LIMIT");
      // Embedding spends shared budget, so uploads pause when research would.
      if (!await researchAvailable(db, dependencies.operatorBudgetKey)) throw new AdmissionError("BUDGET_EXCEEDED");
      const { pages, characters } = await parsePdf(input.bytes);
      const chunks = chunkPages(pages);
      if (!chunks.length) throw new DocumentError("DOCUMENT_UNREADABLE");
      if (chunks.length > DOCUMENT_LIMITS.maxChunks) throw new DocumentError("DOCUMENT_TOO_LARGE");

      const id = randomUUID(), key = documentStorageKey(owner, id), at = now();
      await dependencies.store.put(key, input.bytes);
      try {
        const created = await db.transaction(async tx => {
          // Serialises this owner's uploads so the quota, allowance and duplicate checks hold under concurrency.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"documents:" + owner}, 0))`);
          const [duplicate] = await tx.select().from(documents).where(and(eq(documents.userId, owner), eq(documents.contentHash, contentHash)));
          if (duplicate) return { created: false, row: duplicate };
          const [{ total: current }] = await tx.select({ total: count() }).from(documents).where(eq(documents.userId, owner));
          if (current >= DOCUMENT_LIMITS.maxDocuments) throw new DocumentError("DOCUMENT_LIMIT_REACHED");
          const counted = await tx.insert(documentUsage).values({ userId: owner, day, characters })
            .onConflictDoUpdate({ target: [documentUsage.userId, documentUsage.day], set: { characters: sql`${documentUsage.characters} + ${characters}` },
              setWhere: sql`${documentUsage.characters} + ${characters} <= ${DOCUMENT_LIMITS.dailyCharacters}` })
            .returning({ characters: documentUsage.characters });
          if (!counted.length) throw new DocumentError("DOCUMENT_DAILY_LIMIT");
          const [row] = await tx.insert(documents).values({ id, userId: owner, title: input.title, contentHash, storageKey: key,
            byteSize: input.bytes.length, pageCount: pages.length, status: "PROCESSING", chunkCount: chunks.length, createdAt: at, updatedAt: at }).returning();
          for (let start = 0; start < chunks.length; start += 500) {
            await tx.insert(documentChunks).values(chunks.slice(start, start + 500).map(chunk => ({ documentId: id, userId: owner, ...chunk })));
          }
          return { created: true, row };
        });
        if (!created.created) await dependencies.store.delete(key).catch(() => undefined);
        return { created: created.created, document: view(created.row) };
      } catch (error) {
        await dependencies.store.delete(key).catch(() => undefined);
        throw error;
      }
    },

    // Idempotent: another user's ID or an already deleted document also succeeds, revealing nothing.
    async remove(subject: string, id: string) {
      const owner = await ownerId(subject);
      const removed = await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, owner))).returning({ key: documents.storageKey });
      for (const { key } of removed) await dependencies.store.delete(key).catch(() => undefined);
    },

    async file(subject: string, id: string) {
      const owner = await ownerId(subject);
      const [row] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.userId, owner)));
      if (!row) throw new AdmissionError("NOT_FOUND");
      const bytes = await dependencies.store.get(row.storageKey);
      if (!bytes) throw new AdmissionError("NOT_FOUND");
      return { title: row.title, bytes };
    },

    // Resumable and safe to run concurrently: chunks are leased, so overlapping workers
    // (the upload's background task and the scheduled job) never embed the same chunk twice.
    async embedPending(provider: EmbeddingProvider, options: { deadline: number; signal?: AbortSignal; documentId?: string }) {
      // A worker killed mid-batch leaves its attempts spent and no catch to record failure.
      // Once no attempt remains and no lease is live, the document can never finish.
      await db.update(documents).set({ status: "FAILED", failureCode: "EMBEDDING_FAILED", updatedAt: now() })
        .where(and(eq(documents.status, "PROCESSING"), sql`EXISTS (SELECT 1 FROM document_chunks c WHERE c.document_id = ${documents.id} AND c.embedding IS NULL
          AND c.attempts >= ${DOCUMENT_LIMITS.embeddingAttempts} AND (c.lease_until IS NULL OR c.lease_until < clock_timestamp()))`));
      let embedded = 0, failed = 0;
      while (performance.now() < options.deadline && !options.signal?.aborted) {
        const claimed = await db.transaction(async tx => {
          const at = now();
          const rows = await tx.select({ id: documentChunks.id, documentId: documentChunks.documentId, page: documentChunks.page, text: documentChunks.text, title: documents.title })
            .from(documentChunks).innerJoin(documents, and(eq(documents.id, documentChunks.documentId), eq(documents.userId, documentChunks.userId)))
            .where(and(eq(documents.status, "PROCESSING"), isNull(documentChunks.embedding), lt(documentChunks.attempts, DOCUMENT_LIMITS.embeddingAttempts),
              options.documentId ? eq(documents.id, options.documentId) : undefined,
              or(isNull(documentChunks.leaseUntil), lt(documentChunks.leaseUntil, at))))
            .orderBy(asc(documents.createdAt), asc(documentChunks.ordinal)).limit(DOCUMENT_LIMITS.embeddingBatchSize).for("update", { of: documentChunks, skipLocked: true });
          if (rows.length) await tx.update(documentChunks).set({ leaseUntil: new Date(at.getTime() + DOCUMENT_LIMITS.embeddingLeaseMs), attempts: sql`${documentChunks.attempts} + 1` })
            .where(inArray(documentChunks.id, rows.map(row => row.id)));
          return rows;
        });
        if (!claimed.length) break;
        // The title and page give each chunk context the bare excerpt lacks.
        const inputs = claimed.map(chunk => `${chunk.title}, page ${chunk.page}\n${chunk.text}`);
        const cap = embeddingCapMicroUsd(inputs);
        const reserved = await reserveOperatorBudget(db, dependencies.operatorBudgetKey, cap);
        if (!reserved) {
          await db.update(documentChunks).set({ leaseUntil: null, attempts: sql`greatest(${documentChunks.attempts} - 1, 0)` }).where(inArray(documentChunks.id, claimed.map(row => row.id)));
          break;
        }
        try {
          const result = await provider.embed(inputs, options.signal ?? new AbortController().signal);
          // A missing cost stays at the cap; a reported cost is charged in full, even above it.
          const cost = result.costMicroUsd ?? cap;
          await db.transaction(async tx => {
            const stored: { documentId: string }[] = [];
            for (const [index, chunk] of claimed.entries()) {
              // A worker that outlived its lease may find the chunk already embedded by another.
              const updated = await tx.update(documentChunks).set({ embedding: result.vectors[index], embeddingModel: result.model, leaseUntil: null })
                .where(and(eq(documentChunks.id, chunk.id), isNull(documentChunks.embedding))).returning({ documentId: documentChunks.documentId });
              stored.push(...updated);
            }
            await adjustOperatorBudget(tx, reserved, cost - cap);
            await settleDocuments(tx, claimed, stored, cost, now());
          });
          embedded += claimed.length;
        } catch {
          // An unknown outcome keeps the full cap charged: it may have been billed.
          failed += claimed.length;
          await db.transaction(async tx => {
            await tx.update(documentChunks).set({ leaseUntil: null }).where(inArray(documentChunks.id, claimed.map(row => row.id)));
            await settleDocuments(tx, claimed, [], cap, now());
            await tx.update(documents).set({ status: "FAILED", failureCode: "EMBEDDING_FAILED", updatedAt: now() })
              .where(and(inArray(documents.id, [...new Set(claimed.map(row => row.documentId))]), eq(documents.status, "PROCESSING"),
                sql`EXISTS (SELECT 1 FROM document_chunks c WHERE c.document_id = ${documents.id} AND c.embedding IS NULL AND c.attempts >= ${DOCUMENT_LIMITS.embeddingAttempts})`));
          });
          break;
        }
      }
      return { embedded, failed };
    },
  };
}

type Transaction = Parameters<Parameters<AdmissionDatabase["transaction"]>[0]>[0];
class BudgetUnavailable extends Error {}

// Charges the cap up front against the active operator period and day, and only while the
// budget stays above the research floor; the difference is settled once the real cost is known.
async function reserveOperatorBudget(db: AdmissionDatabase, budgetKey: string, cap: bigint) {
  return db.transaction(async tx => {
    // Also locks the active windows in ID order, matching admission and settlement.
    await tx.execute(sql`SELECT ensure_operator_day(${budgetKey})`);
    const rows = await tx.update(operatorUsageBuckets).set({ settledProviderMicroUsd: sql`${operatorUsageBuckets.settledProviderMicroUsd} + ${cap}` })
      .where(and(eq(operatorUsageBuckets.budgetKey, budgetKey), sql`${operatorUsageBuckets.startsAt} <= clock_timestamp()`, sql`${operatorUsageBuckets.endsAt} > clock_timestamp()`,
        sql`${operatorUsageBuckets.providerLimitMicroUsd} - ${operatorUsageBuckets.reservedProviderMicroUsd} - ${operatorUsageBuckets.settledProviderMicroUsd} >= ${cap + DOCUMENT_LIMITS.operatorFloorMicroUsd}`))
      .returning({ id: operatorUsageBuckets.id, kind: operatorUsageBuckets.kind });
    if (rows.length !== 2 || new Set(rows.map(row => row.kind)).size !== 2) throw new BudgetUnavailable();
    return rows.map(row => row.id);
  }).catch(error => { if (error instanceof BudgetUnavailable) return null; throw error; });
}
// Positive amounts charge more, negative ones refund. Rows are locked in ID order first,
// like every other writer of these buckets, so this can't deadlock with settlement.
async function adjustOperatorBudget(tx: Transaction, bucketIds: string[], amount: bigint) {
  if (amount === 0n) return;
  await tx.select({ id: operatorUsageBuckets.id }).from(operatorUsageBuckets).where(inArray(operatorUsageBuckets.id, bucketIds)).orderBy(operatorUsageBuckets.id).for("update");
  await tx.update(operatorUsageBuckets).set({ settledProviderMicroUsd: sql`greatest(${operatorUsageBuckets.settledProviderMicroUsd} + ${amount}, 0)` })
    .where(inArray(operatorUsageBuckets.id, bucketIds));
}
// Splits a batch cost across its documents in proportion to their chunks, counts only the
// vectors actually written, and marks a document READY once no chunk lacks a vector.
async function settleDocuments(tx: Transaction, claimed: { documentId: string }[], stored: { documentId: string }[], cost: bigint, at: Date) {
  const claimedBy = new Map<string, number>(), storedBy = new Map<string, number>();
  for (const row of claimed) claimedBy.set(row.documentId, (claimedBy.get(row.documentId) ?? 0) + 1);
  for (const row of stored) storedBy.set(row.documentId, (storedBy.get(row.documentId) ?? 0) + 1);
  let remaining = cost;
  const entries = [...claimedBy.entries()];
  for (const [index, [documentId, chunks]] of entries.entries()) {
    const share = index === entries.length - 1 ? remaining : cost * BigInt(chunks) / BigInt(claimed.length);
    remaining -= share;
    await tx.update(documents).set({ costMicroUsd: sql`${documents.costMicroUsd} + ${share}`, updatedAt: at,
      embeddedCount: sql`${documents.embeddedCount} + ${storedBy.get(documentId) ?? 0}` }).where(eq(documents.id, documentId));
  }
  if (stored.length) await tx.update(documents).set({ status: "READY", updatedAt: at })
    .where(and(inArray(documents.id, entries.map(([id]) => id)), eq(documents.status, "PROCESSING"),
      sql`NOT EXISTS (SELECT 1 FROM document_chunks c WHERE c.document_id = ${documents.id} AND c.embedding IS NULL)`));
}
