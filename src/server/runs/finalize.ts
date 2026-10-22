import { randomUUID } from "node:crypto";
import { and,eq,gt,sql } from "drizzle-orm";
import { z } from "zod";
import { ACTIVE_RUN_STATUSES,conversations,messages,outputReviews,messageCitations,runs,inputSafetyReviews,providerCalls,runSettlements,runSources,sourcePassages,session,runRetrievals } from "@/db/schema";
import type { AdmissionDatabase,AdmissionTransaction } from "./usage";
import { lockOwnedRun } from "./lock";
import { AdmissionError } from "./errors";
import { settleRun } from "./settle";
import { isApprovedResponse } from "@/server/safety/release";
import { SAFETY_POLICY } from "@/server/safety/policy";
import { serializeApprovedPayload } from "@/server/ai/approved-payload";
import type { PublicErrorCode } from "@/server/contracts/errors";
const isPolicyBlock=(code:PublicErrorCode)=>code === "OUTPUT_BLOCKED" || code === "INPUT_BLOCKED";
export type Finalization = { kind: "COMMITTED" | "ALREADY_COMMITTED";runId: string;messageId: string } | { kind: "DENIED";code: PublicErrorCode };
export async function lockCompletionSession(tx: AdmissionTransaction,subject: string,sessionId: string) {
  const [current] = await tx.select({ id: session.id,expiresAt: session.expiresAt,createdAt: session.createdAt }).from(session)
    .where(and(eq(session.id,sessionId),eq(session.userId,subject))).for("share");
  if (!current) throw new AdmissionError("UNAUTHENTICATED");return current;
}
export function createFinalization(db: AdmissionDatabase) {
  return {
    async commit(subject: string,sessionId: string,value: unknown,signal: AbortSignal): Promise<Finalization> {
      if (!isApprovedResponse(value)) return { kind: "DENIED",code: "OUTPUT_BLOCKED" };
      try { return await db.transaction(async(tx): Promise<Finalization>=>{
        const current = await lockCompletionSession(tx,subject,sessionId),{ run,conversation,now } = await lockOwnedRun(tx,subject,value.runId);
        if (current.expiresAt <= now || current.createdAt.getTime()+30*86400000 <= now.getTime()) throw new AdmissionError("UNAUTHENTICATED");
        const serialized = serializeApprovedPayload(value);
        const [existing] = await tx.select().from(outputReviews).where(eq(outputReviews.runId,run.id));
        if (run.status === "COMPLETED" && existing?.decision === "ALLOW" && existing.messageId && existing.payloadHash === serialized.payloadHash) return { kind: "ALREADY_COMMITTED",runId: run.id,messageId: existing.messageId };
        if (run.status !== "CHECKING_OUTPUT" || signal.aborted || run.deadlineAt <= now || run.attemptVersion !== value.attemptVersion ||
          conversation.revision !== value.revision || run.admittedRevision !== value.revision || value.policyVersion !== SAFETY_POLICY.version || run.policyVersion !== value.policyVersion) throw new AdmissionError("CONFLICT");
        const calls = await tx.select().from(providerCalls).where(eq(providerCalls.runId,run.id));
        if (!calls.some(c=>c.stage === "OUTPUT_SAFETY" && c.status === "SUCCEEDED" && c.attemptVersion === run.attemptVersion) ||
          !calls.some(c=>c.stage === "ANSWER" && (c.status === (value.kind === "ANSWER" ? "SUCCEEDED" : "SKIPPED")) && c.attemptVersion === run.attemptVersion)) throw new AdmissionError("SAFETY_UNAVAILABLE");
        const [input] = await tx.select({ approvedAt: messages.approvedAt,messagePolicy: messages.policyVersion,reviewPolicy: inputSafetyReviews.policyVersion })
          .from(inputSafetyReviews).innerJoin(messages,eq(messages.id,inputSafetyReviews.acceptedMessageId))
          .where(and(eq(inputSafetyReviews.runId,run.id),eq(inputSafetyReviews.decision,"ALLOW"),eq(inputSafetyReviews.attemptVersion,run.attemptVersion)));
        if (!input?.approvedAt || input.messagePolicy !== value.policyVersion || input.reviewPolicy !== value.policyVersion) throw new AdmissionError("SAFETY_UNAVAILABLE");
        const [retrieval] = await tx.select().from(runRetrievals).where(eq(runRetrievals.runId,run.id));
        if (!retrieval || retrieval.expiresAt <= now || retrieval.policyVersion !== value.policyVersion || retrieval.attemptVersion !== run.attemptVersion ||
          (value.kind === "ANSWER" ? retrieval.status !== "READY" : retrieval.status !== "NO_EVIDENCE")) throw new AdmissionError("CONFLICT");
        const sources = await tx.select().from(runSources).where(eq(runSources.runId,run.id)).limit(6);
        const passages = await tx.select().from(sourcePassages).where(eq(sourcePassages.runId,run.id)).limit(6);
        const messageId = randomUUID(),citations = [];
        for (const source of value.sources) {
          const stored = sources.find(s=>s.sourceKey === source.sourceId),passage = passages.find(p=>p.id === source.passageIds[0]);
          if (!stored || !passage || stored.id !== passage.sourceId || stored.url !== source.url || stored.title !== source.title ||
            (stored.publishedAt?.toISOString() ?? null) !== source.publishedAt || passage.contentHash !== source.contentHashes[0]) throw new AdmissionError("CONFLICT");
          citations.push({ runId: run.id,messageId,sourceId: stored.id,passageId: passage.id,number: source.number,supportStatus: "NOT_CHECKED" });
        }
        await tx.insert(outputReviews).values({ runId: run.id,conversationId: conversation.id,attemptVersion: run.attemptVersion,decision: "ALLOW",policyVersion: value.policyVersion,
          messageId,bodyHash: serialized.bodyHash,payloadHash: serialized.payloadHash,payload: serialized.payload,createdAt: now });
        await tx.insert(messages).values({ id: messageId,conversationId: conversation.id,role: "ASSISTANT",kind: value.kind === "CLARIFICATION" ? "CLARIFICATION" : "ANSWER",
          parts: [{ type: "text",text: value.markdown }],sequence: conversation.nextSequence,approvedAt: now,policyVersion: value.policyVersion,createdAt: now });
        if (citations.length) await tx.insert(messageCitations).values(citations);
        await settleRun(tx,run,value.kind === "ANSWER" ? run.answerCredits : 0,now);
        await tx.update(conversations).set({ nextSequence: conversation.nextSequence+1,updatedAt: now }).where(eq(conversations.id,conversation.id));
        if (signal.aborted) throw new AdmissionError("CONFLICT");
        const changed = await tx.update(runs).set({ status: "COMPLETED",updatedAt: now }).where(and(eq(runs.id,run.id),eq(runs.status,"CHECKING_OUTPUT"),eq(runs.attemptVersion,value.attemptVersion),gt(runs.deadlineAt,sql`clock_timestamp()`),
          sql`EXISTS (SELECT 1 FROM session s WHERE s.id = ${sessionId} AND s.user_id = ${subject} AND s.expires_at > clock_timestamp() AND s.created_at + interval '30 days' > clock_timestamp())`)).returning({ id: runs.id });
        if (!changed.length || signal.aborted) throw new AdmissionError("CONFLICT");
        return { kind: "COMMITTED",runId: run.id,messageId };
      }); } catch (error) { return { kind: "DENIED",code: error instanceof AdmissionError ? error.code : "PROVIDER_UNAVAILABLE" }; }
    },
    async fail(subject: string,runId: string,code: PublicErrorCode,fence?: { attemptVersion: number;revision: number },cancelled = false): Promise<Finalization> {
      if (!z.uuid().safeParse(runId).success) return { kind: "DENIED",code: "NOT_FOUND" };
      try { return await db.transaction(async(tx): Promise<Finalization>=>{
        const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
        if (fence && (run.attemptVersion !== fence.attemptVersion || conversation.revision !== fence.revision)) throw new AdmissionError("CONFLICT");
        const outcome=!isPolicyBlock(code)&&run.deadlineAt<=now?'DEADLINE_EXCEEDED':code;
        await settleFailureLocked(tx,run,now,outcome,cancelled);
        return { kind: "DENIED",code:outcome };
      }); } catch (error) { return { kind: "DENIED",code: error instanceof AdmissionError ? error.code : "PROVIDER_UNAVAILABLE" }; }
    },
  };
}

// Caller holds owner/conversation/run locks. No external work occurs in this transaction.
export async function settleFailureLocked(tx: AdmissionTransaction,run: typeof runs.$inferSelect,now: Date,code: PublicErrorCode,cancelled=false) {
  const active=ACTIVE_RUN_STATUSES.some(s=>s===run.status);
  if(run.status === "COMPLETED" || run.status === "NEEDS_CLARIFICATION") throw new AdmissionError("CONFLICT");
  const [settled]=await tx.select().from(runSettlements).where(eq(runSettlements.runId,run.id));
  if(settled) {
    if(active)throw new AdmissionError("CONFLICT");
    return;
  }
  const [review]=await tx.select().from(outputReviews).where(eq(outputReviews.runId,run.id));
  if(review?.decision === "ALLOW")throw new AdmissionError("CONFLICT");
  if(!review)await tx.insert(outputReviews).values({runId:run.id,conversationId:run.conversationId,attemptVersion:run.attemptVersion,
    decision:isPolicyBlock(code) ? "BLOCK" : "UNAVAILABLE",policyVersion:SAFETY_POLICY.version,createdAt:now});
  await settleRun(tx,run,0,now);
  const status=!active ? run.status : isPolicyBlock(code) ? "BLOCKED" : run.deadlineAt <= now || code === "DEADLINE_EXCEEDED" ? "TIMED_OUT" : cancelled ? "CANCELLED" : "FAILED";
  await tx.update(runs).set({status,updatedAt:now,attemptVersion:run.attemptVersion+(active?1:0)})
    .where(and(eq(runs.id,run.id),eq(runs.status,run.status),eq(runs.attemptVersion,run.attemptVersion)));
}
