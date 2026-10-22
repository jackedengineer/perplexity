import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { inputSafetyReviews, messages, runRetrievals, runs, runSources, sourcePassages, usageReservations } from "@/db/schema";
import type { PublicErrorCode } from "@/server/contracts/errors";
import { AdmissionError } from "@/server/runs/errors";
import { lockOwnedRun } from "@/server/runs/lock";
import type { AdmissionDatabase, AdmissionTransaction } from "@/server/runs/usage";
import { createInputGate } from "@/server/safety/input";
import { createEvidenceGate, EVIDENCE_DETECTOR_VERSION } from "@/server/safety/evidence";
import { SAFETY_POLICY } from "@/server/safety/policy";
import { buildEvidence, validateEvidence } from "./evidence";
import { RETRIEVAL_LIMITS, RetrievalError, searchQuerySchema } from "./limits";
import type { SearchProvider } from "./tavily";
import type { EvidencePackage } from "@/server/contracts/pipeline";

type Dependencies = { modelId: string; search: SearchProvider; queryGate: ReturnType<typeof createInputGate>; evidenceGate: ReturnType<typeof createEvidenceGate> };
export type RetrievalResult = { kind: "READY" | "NO_EVIDENCE";runId: string;sources: number;passages: number }
  | { kind: "RUN_IN_PROGRESS" | "RUN_ALREADY_FINISHED";runId: string } | { kind: "DENIED";code: PublicErrorCode };
const denied = (code: PublicErrorCode): RetrievalResult => ({ kind: "DENIED",code });
const terminal = new Set(["COMPLETED","NEEDS_CLARIFICATION","BLOCKED","FAILED","CANCELLED","TIMED_OUT"]);
type Fence = { attemptVersion: number; admittedRevision: number };
async function checkpoint(tx: AdmissionTransaction,subject: string,runId: string,fence: Fence,status: string,signal: AbortSignal) {
  const locked = await lockOwnedRun(tx,subject,runId), { run,conversation,now } = locked;
  if (run.status !== status || run.attemptVersion !== fence.attemptVersion || conversation.revision !== fence.admittedRevision ||
    run.admittedRevision !== fence.admittedRevision || run.policyVersion !== SAFETY_POLICY.version) throw new AdmissionError("CONFLICT");
  if (signal.aborted || run.deadlineAt <= now) throw new RetrievalError();
  return locked;
}
export function createRetrieval(db: AdmissionDatabase,dependencies?: Dependencies) {
  return {
    async retrieve(subject: string,runId: string,signal: AbortSignal): Promise<RetrievalResult> {
      if (!z.uuid().safeParse(runId).success) return denied("NOT_FOUND");
      if (!dependencies) return denied("CONFIGURATION_UNAVAILABLE");
      const { search,queryGate,evidenceGate } = dependencies;
      let claim: Fence | undefined,stage = "SEARCHING";
      let queryVerdict: string | null = null,evidenceVerdict: string | null = null,searchCredits: number | null = null;
      try {
        const prepared = await db.transaction(async(tx)=>{
          const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
          if (run.status !== "PLANNING") return { kind: terminal.has(run.status) ? "RUN_ALREADY_FINISHED" : "RUN_IN_PROGRESS",runId } as const;
          if (signal.aborted || run.deadlineAt <= now) throw new RetrievalError();
          if (conversation.revision !== run.admittedRevision) throw new AdmissionError("CONFLICT");
          if (run.policyVersion !== SAFETY_POLICY.version || run.catalogVersion !== "fast-v1" || run.priceVersion !== "standard-v1") throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
          const [reservation] = await tx.select().from(usageReservations).where(and(eq(usageReservations.runId,runId),eq(usageReservations.userId,run.userId)));
          if (!reservation || reservation.providerReserveMicroUsd < RETRIEVAL_LIMITS.reserveMicroUsd) throw new AdmissionError("BUDGET_EXCEEDED");
          const [review] = await tx.select().from(inputSafetyReviews).where(and(eq(inputSafetyReviews.runId,runId),eq(inputSafetyReviews.decision,"ALLOW"),eq(inputSafetyReviews.attemptVersion,run.attemptVersion)));
          if (!review?.acceptedMessageId || review.policyVersion !== SAFETY_POLICY.version) throw new AdmissionError("SAFETY_UNAVAILABLE");
          const [message] = await tx.select().from(messages).where(and(eq(messages.id,review.acceptedMessageId),eq(messages.conversationId,run.conversationId)));
          const parts = z.tuple([z.strictObject({ type: z.literal("text"),text: searchQuerySchema })]).safeParse(message?.parts);
          if (!message?.approvedAt || message.role !== "USER" || message.kind !== "QUESTION" || message.sequence !== 1 ||
            message.policyVersion !== SAFETY_POLICY.version || !parts.success) throw new AdmissionError("INVALID_INPUT");
          await tx.insert(runRetrievals).values({ runId,attemptVersion: run.attemptVersion,policyVersion: run.policyVersion,
            detectorVersion: EVIDENCE_DETECTOR_VERSION,modelId: dependencies.modelId,status: "STARTED",createdAt: now,expiresAt: new Date(now.getTime()+30*86_400_000) });
          await tx.update(runs).set({ status: "SEARCHING",updatedAt: now }).where(eq(runs.id,runId));
          return { kind: "CLAIMED",run,query: parts.data[0].text } as const;
        });
        if (prepared.kind !== "CLAIMED") return prepared;
        claim = prepared.run;
        const options = { signal,deadlineAt: prepared.run.deadlineAt };
        const queryCheck = await queryGate.evaluate({ text: prepared.query,context: [] },options);
        queryVerdict = queryCheck.verdict.decision;
        if (queryVerdict !== "ALLOW") throw new RetrievalError(queryVerdict === "BLOCK" ? "INPUT_BLOCKED" : "SAFETY_UNAVAILABLE");
        // Recheck fences before external paid search. No provider runs inside this transaction.
        await db.transaction(tx=>checkpoint(tx,subject,runId,prepared.run,stage,signal));
        const response = await search.search(prepared.query,options); searchCredits = response.credits;
        await db.transaction(async(tx)=>{
          const { now } = await checkpoint(tx,subject,runId,prepared.run,stage,signal);
          await tx.update(runs).set({ status: "PREPARING_EVIDENCE",updatedAt: now }).where(eq(runs.id,runId));
        });
        stage = "PREPARING_EVIDENCE";
        const evidence = buildEvidence(runId,response.results,new Date());
        if (evidence.sources.length) {
          const checked = await evidenceGate.evaluate(evidence,options); evidenceVerdict = checked.verdict.decision;
          if (evidenceVerdict !== "ALLOW") throw new RetrievalError(evidenceVerdict === "BLOCK" ? "OUTPUT_BLOCKED" : "SAFETY_UNAVAILABLE");
        }
        return await db.transaction(async(tx): Promise<RetrievalResult>=>{
          const { now } = await checkpoint(tx,subject,runId,prepared.run,stage,signal);
          const status = evidence.sources.length ? "READY" : "NO_EVIDENCE";
          const reviewed = await tx.update(runRetrievals).set({ status,queryVerdict,evidenceVerdict,searchCredits })
            .where(and(eq(runRetrievals.runId,runId),eq(runRetrievals.status,"STARTED"))).returning({ id: runRetrievals.runId });
          if (!reviewed.length) throw new AdmissionError("CONFLICT");
          if (evidence.sources.length) {
            const stored = await tx.insert(runSources).values(evidence.sources.map(source=>({ runId,sourceKey: source.sourceId,url: source.url,
              title: source.title,rank: source.sourceRank,retrievedAt: new Date(source.retrievedAt),
              publishedAt: source.publishedAt ? new Date(source.publishedAt) : null }))).returning({ id: runSources.id,key: runSources.sourceKey });
            await tx.insert(sourcePassages).values(evidence.passages.map(passage=>({ id: passage.passageId,runId,
              sourceId: stored.find(source=>source.key === passage.sourceId)!.id,text: passage.text,contentHash: passage.contentHash,contentKind: passage.contentKind })));
          }
          if (signal.aborted) throw new RetrievalError();
          const changed = await tx.update(runs).set({ status: "GENERATING",updatedAt: now }).where(and(eq(runs.id,runId),eq(runs.status,"PREPARING_EVIDENCE"),
            eq(runs.attemptVersion,prepared.run.attemptVersion),gt(runs.deadlineAt,sql`clock_timestamp()`))).returning({ id: runs.id });
          if (!changed.length || signal.aborted) throw new RetrievalError();
          return { kind: status,runId,sources: evidence.sources.length,passages: evidence.passages.length };
        });
      } catch (error) {
        const fence = claim;
        const code = error instanceof AdmissionError || error instanceof RetrievalError ? error.code : "PROVIDER_UNAVAILABLE";
        if (fence) {
          try { await db.transaction(async(tx)=>{
            const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
            if (run.attemptVersion !== fence.attemptVersion || run.status !== stage || conversation.revision !== fence.admittedRevision) return;
            const status = run.deadlineAt <= now ? "TIMED_OUT" : signal.aborted ? "CANCELLED" : code === "INPUT_BLOCKED" || code === "OUTPUT_BLOCKED" ? "BLOCKED" : "FAILED";
            await tx.update(runRetrievals).set({ status: status === "BLOCKED" ? "BLOCKED" : "UNAVAILABLE",queryVerdict,evidenceVerdict,searchCredits }).where(eq(runRetrievals.runId,runId));
            await tx.update(runs).set({ status,updatedAt: now }).where(eq(runs.id,runId));
          }); } catch { /* Keep an unknown outcome held; never retry provider work. */ }
        }
        return denied(code);
      }
    },
    async load(subject: string,runId: string): Promise<EvidencePackage | null> {
      if (!z.uuid().safeParse(runId).success) return null;
      try { return await db.transaction(async(tx)=>{
        const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
        const [record] = await tx.select().from(runRetrievals).where(eq(runRetrievals.runId,runId));
        if (!record || !["READY","NO_EVIDENCE"].includes(record.status) || record.expiresAt <= now || run.deadlineAt <= now || run.status !== "GENERATING" ||
          record.attemptVersion !== run.attemptVersion || record.policyVersion !== SAFETY_POLICY.version || run.policyVersion !== record.policyVersion || conversation.revision !== run.admittedRevision) return null;
        const sources = await tx.select().from(runSources).where(eq(runSources.runId,runId)).orderBy(runSources.rank).limit(6);
        const passages = await tx.select().from(sourcePassages).where(eq(sourcePassages.runId,runId)).limit(6);
        if ((record.status === "READY") !== (sources.length > 0)) return null;
        return validateEvidence({ runId,sources: sources.map(s=>({ sourceId: s.sourceKey,url: s.url,title: s.title,sourceRank: s.rank,
          publishedAt: s.publishedAt?.toISOString() ?? null,retrievedAt: s.retrievedAt.toISOString() })),
          passages: passages.map(p=>({ passageId: p.id,sourceId: sources.find(s=>s.id === p.sourceId)?.sourceKey,text: p.text,contentHash: p.contentHash,contentKind: p.contentKind })) });
      }); } catch { return null; }
    },
  };
}
