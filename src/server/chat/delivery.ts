import { and,eq,isNull,sql } from "drizzle-orm";
import { z } from "zod";
import { ACTIVE_RUN_STATUSES,conversations,appUsers,messages,outputReviews,runs,session } from "@/db/schema";
import type { AdmissionDatabase } from "@/server/runs/usage";
import { AdmissionError } from "@/server/runs/errors";
import { serializeApprovedPayload } from "@/server/ai/approved-payload";
import { presentAnswer } from "@/server/answers/presentation";
import { SAFETY_POLICY } from "@/server/safety/policy";
import { committedAnswerView,runStateView,type RunState } from "./views";
import { createRunRecovery } from "@/server/runs/recover";
export type ChatIdentity = { user: { id: string };sessionId: string };
export function createAnswerDelivery(db: AdmissionDatabase) {
  async function load(identity: ChatIdentity,runId: string,allowRecovery=true): Promise<RunState> {
    if (!z.uuid().safeParse(runId).success) throw new AdmissionError("NOT_FOUND");
    // One owned read checks the live DB session even when recovering a completed old run.
    const [row] = await db.select({ id: runs.id,conversationId: runs.conversationId,revision: runs.admittedRevision,status: runs.status,deadlineAt:runs.deadlineAt,dbNow:sql<string>`clock_timestamp()::text`,
      policyVersion: runs.policyVersion,payload: outputReviews.payload,payloadHash: outputReviews.payloadHash,bodyHash: outputReviews.bodyHash,
      decision: outputReviews.decision,messageId: messages.id,parts: messages.parts,approvedAt: messages.approvedAt,messagePolicy: messages.policyVersion,createdAt: messages.createdAt,
    }).from(runs).innerJoin(conversations,and(eq(conversations.id,runs.conversationId),isNull(conversations.deletedAt))).innerJoin(appUsers,eq(appUsers.id,runs.userId))
      .innerJoin(session,and(eq(session.userId,appUsers.authSubject),eq(session.id,identity.sessionId),sql`${session.expiresAt} > clock_timestamp()`,sql`${session.createdAt} + interval '30 days' > clock_timestamp()`))
      .leftJoin(outputReviews,eq(outputReviews.runId,runs.id)).leftJoin(messages,and(eq(messages.id,outputReviews.messageId),eq(messages.conversationId,runs.conversationId)))
      .where(and(eq(appUsers.authSubject,identity.user.id),eq(runs.id,runId))).limit(1);
    if (!row) throw new AdmissionError("NOT_FOUND");
    if(allowRecovery&&ACTIVE_RUN_STATUSES.some(s=>s===row.status)&&row.deadlineAt<=new Date(row.dbNow)) {
      await createRunRecovery(db).expire(identity,runId);return load(identity,runId,false);
    }
    const base = { runId: row.id,conversationId: row.conversationId,revision: row.revision };
    if (!["COMPLETED","NEEDS_CLARIFICATION"].includes(row.status)) {
      const state = row.status === "RECEIVED" || row.status === "CHECKING_INPUT" ? "CHECKING_REQUEST"
        : row.status === "PLANNING" ? "PLANNING" : ["SEARCHING","PREPARING_EVIDENCE"].includes(row.status) ? "SEARCHING"
        : row.status === "GENERATING" ? "PREPARING_ANSWER" : row.status === "CHECKING_OUTPUT" ? "CHECKING_ANSWER" : "UNAVAILABLE";
      return runStateView.parse({ ...base,state,...(row.status==="CANCELLED"||row.status==="TIMED_OUT"?{terminalReason:row.status}:{}) });
    }
    if (row.policyVersion !== SAFETY_POLICY.version || row.decision !== "ALLOW" || !row.messageId || !row.approvedAt || row.messagePolicy !== SAFETY_POLICY.version || row.parts?.length !== 1) throw new AdmissionError("OUTPUT_BLOCKED");
    try {
      const canonical = serializeApprovedPayload(row.payload);
      if (canonical.payload.runId !== runId || canonical.bodyHash !== row.bodyHash || canonical.payloadHash !== row.payloadHash || canonical.payload.markdown !== row.parts[0].text) throw new Error("Invalid saved answer");
      const answer = committedAnswerView.parse({ ...base,messageId: row.messageId,text: canonical.payload.markdown,answer: presentAnswer(canonical.payload),createdAt: row.createdAt!.toISOString() });
      return { ...base,state: row.status === "NEEDS_CLARIFICATION" ? "NEEDS_CLARIFICATION" : "COMPLETED",answer };
    } catch { throw new AdmissionError("OUTPUT_BLOCKED"); }
  }
  return {load};
}
