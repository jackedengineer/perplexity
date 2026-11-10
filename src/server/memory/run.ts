import { and, eq, gte, sql } from "drizzle-orm";
import { appUsers, conversations, inputSafetyReviews, memoryExtractions, memorySettings, messages, runDocuments, runs, user, MEMORY_LIMITS } from "@/db/schema";
import type { AdmissionDatabase, AdmissionTransaction } from "@/server/runs/usage";
import { checkOperations } from "./checks";
import { ExtractionError, EXTRACTION_LIMITS, type ExtractionProvider } from "./extract";
import { mentionsSelf } from "./gate";
import { applyOperations, listMemories } from "./store";

export type MemoryExtraction = { provider: ExtractionProvider; schedule: (work: () => Promise<void>) => void };
type Log = (event: Record<string, unknown>) => void;
const defaultLog: Log = event => console.info(JSON.stringify(event));
const utcDay = (now: Date) => new Date(now.toISOString().slice(0, 10) + "T00:00:00.000Z");

// The message-level reasons extraction would skip this run. The answer uses it too, so it only
// acknowledges "remember / forget that…" when something will actually be saved.
export async function skipReason(db: AdmissionDatabase | AdmissionTransaction, runId: string, userId: string, message: string, dailyLimit: number = MEMORY_LIMITS.extractionsPerDay) {
  if (!mentionsSelf(message)) return "NOT_PERSONAL" as const;
  const [files] = await db.select({ n: sql<number>`count(*)::integer` }).from(runDocuments).where(eq(runDocuments.runId, runId));
  if (files.n > 0) return "FILES" as const;
  const [used] = await db.select({ n: sql<number>`count(*)::integer` }).from(memoryExtractions).where(and(eq(memoryExtractions.userId, userId), gte(memoryExtractions.createdAt, utcDay(new Date()))));
  return used.n >= dailyLimit ? "DAILY_LIMIT" as const : null;
}

// Runs after an answer has been saved, never before: the user never waits for it and nothing is
// shown either way. It reads only the user's own accepted message, never sources, files or
// answers. Every failure is recorded and swallowed. Logs carry counts, never memory text.
export async function extractMemories(db: AdmissionDatabase, runId: string, provider: ExtractionProvider, options: { dailyLimit?: number; log?: Log } = {}) {
  const log = options.log ?? defaultLog, started = performance.now();
  // The fence is taken before anything is read: a pause or Delete all after this moment bumps the
  // settings row past it, and applyOperations then writes nothing.
  const fence = new Date();
  const done = (outcome: string, extra: Record<string, unknown> = {}) => { try { log({ event: "memory.extraction", outcome, ...extra, durationMs: Math.round(performance.now() - started) }); } catch { /* Logging never matters here. */ } };
  try {
    const [state] = await db.select({ userId: runs.userId, status: runs.status, guest: user.isAnonymous, enabled: conversations.memoryEnabled, paused: memorySettings.paused,
      messageId: messages.id, parts: messages.parts })
      .from(runs).innerJoin(conversations, and(eq(conversations.id, runs.conversationId), eq(conversations.userId, runs.userId)))
      .innerJoin(appUsers, eq(appUsers.id, runs.userId)).innerJoin(user, eq(user.id, appUsers.authSubject))
      .leftJoin(memorySettings, eq(memorySettings.userId, runs.userId))
      .innerJoin(inputSafetyReviews, and(eq(inputSafetyReviews.runId, runs.id), eq(inputSafetyReviews.decision, "ALLOW")))
      .innerJoin(messages, and(eq(messages.id, inputSafetyReviews.acceptedMessageId), eq(messages.conversationId, runs.conversationId)))
      .where(eq(runs.id, runId));
    if (!state || (state.status !== "COMPLETED" && state.status !== "NEEDS_CLARIFICATION")) return done("SKIPPED", { reason: "NOT_ANSWERED" });
    if (state.guest) return done("SKIPPED", { reason: "GUEST" });
    if (state.paused) return done("SKIPPED", { reason: "PAUSED" });
    if (!state.enabled) return done("SKIPPED", { reason: "TEMPORARY" });
    const message = state.parts.length === 1 ? state.parts[0].text : "";
    const skip = await skipReason(db, runId, state.userId, message, options.dailyLimit);
    if (skip) return done("SKIPPED", { reason: skip });
    // Counted and claimed under the user's settings lock, so concurrent answers can't pass the
    // daily limit. The primary key makes this the one extraction for the run.
    const claim = await db.transaction(async tx => {
      const startedAt = new Date(), today = utcDay(startedAt);
      await tx.insert(memorySettings).values({ userId: state.userId, updatedAt: fence }).onConflictDoNothing();
      await tx.select({ userId: memorySettings.userId }).from(memorySettings).where(eq(memorySettings.userId, state.userId)).for("update");
      const [used] = await tx.select({ n: sql<number>`count(*)::integer` }).from(memoryExtractions).where(and(eq(memoryExtractions.userId, state.userId), gte(memoryExtractions.createdAt, today)));
      if (used.n >= (options.dailyLimit ?? MEMORY_LIMITS.extractionsPerDay)) return "DAILY_LIMIT" as const;
      const [claimed] = await tx.insert(memoryExtractions).values({ runId, userId: state.userId, status: "STARTED", model: provider.modelId, createdAt: startedAt })
        .onConflictDoNothing().returning({ runId: memoryExtractions.runId });
      return claimed ? fence : "ALREADY_RUN" as const;
    });
    if (!(claim instanceof Date)) return done("SKIPPED", { reason: claim });

    const finish = (status: "SUCCEEDED" | "FAILED" | "UNKNOWN", costMicroUsd: bigint | null, operations = 0) =>
      db.update(memoryExtractions).set({ status, costMicroUsd, operations, finishedAt: new Date() }).where(and(eq(memoryExtractions.runId, runId), eq(memoryExtractions.status, "STARTED")));
    try {
      const saved = await listMemories(db, state.userId);
      const result = await provider.extract({ message, memories: saved }, { signal: AbortSignal.timeout(EXTRACTION_LIMITS.maxDurationMs + 2000), deadlineAt: new Date(Date.now() + EXTRACTION_LIMITS.maxDurationMs + 2000) });
      const { accepted, rejected } = checkOperations(result.operations, new Set(saved.map(memory => memory.id)), message);
      const applied = await applyOperations(db, state.userId, accepted, state.messageId, claim);
      await finish("SUCCEEDED", result.usage?.costMicroUsd ?? null, applied);
      const count = (op: string) => accepted.filter(operation => operation.op === op).length;
      return done("SUCCEEDED", { proposed: result.operations.length, added: count("ADD"), updated: count("UPDATE"), deleted: count("DELETE"), applied, rejected });
    } catch (error) {
      const cost = provider.usage?.()?.costMicroUsd ?? null;
      await finish(cost === null ? "UNKNOWN" : "FAILED", cost);
      return done("FAILED", { reason: error instanceof ExtractionError ? error.reason : "UNAVAILABLE" });
    }
  } catch {
    return done("ERROR");
  }
}
