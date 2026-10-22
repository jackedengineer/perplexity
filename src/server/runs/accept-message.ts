import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { conversations, inputSafetyReviews, messages, runs } from "@/db/schema";
import { submissionSchema, type SubmitQuery } from "@/server/contracts/chat";
import type { PublicErrorCode } from "@/server/contracts/errors";
import { createInputGate, type InputCheck } from "@/server/safety/input";
import { INPUT_DETECTOR_VERSION } from "@/server/safety/provider";
import { guardVerdictSchema, SAFETY_POLICY } from "@/server/safety/policy";
import { resolveSafetyDecision, type SafetyResponse } from "@/server/safety/responses";
import { AdmissionError } from "./errors";
import { matchesFingerprint, parseAdmissionConfig, type AdmissionConfig } from "./policy";
import { lockOwnedRun } from "./lock";
import type { AdmissionDatabase, AdmissionTransaction } from "./usage";

export type InputAcceptance =
  | { kind: "ACCEPTED"; runId: string; messageId: string; revision: number }
  | { kind: "RUN_IN_PROGRESS" | "RUN_ALREADY_FINISHED"; runId: string }
  | { kind: "DENIED"; code: PublicErrorCode; response?: SafetyResponse };
const denied = (code: PublicErrorCode): InputAcceptance => ({ kind: "DENIED", code });
const terminal = ["COMPLETED","NEEDS_CLARIFICATION","BLOCKED","FAILED","CANCELLED","TIMED_OUT"];
function verifyPayload(run: typeof runs.$inferSelect, request: SubmitQuery, config: AdmissionConfig) {
  if (!matchesFingerprint(request,run,{ hmac: run.payloadHmac,keyId: run.hmacKeyId,version: run.payloadVersion },config)) {
    throw new AdmissionError("IDEMPOTENCY_MISMATCH");
  }
  if (run.policyVersion !== SAFETY_POLICY.version) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
}
const textParts = z.array(z.strictObject({ type: z.literal("text"), text: z.string().max(4000) })).min(1).max(16);
async function loadContext(tx: AdmissionTransaction, conversationId: string) {
  const tail = await tx.select({ role: messages.role,parts: messages.parts,approvedAt: messages.approvedAt,policyVersion: messages.policyVersion }).from(messages).where(and(
    eq(messages.conversationId,conversationId),or(eq(messages.role,"USER"),isNotNull(messages.approvedAt)),
  )).orderBy(desc(messages.sequence)).limit(7);
  if (tail.length > 6) return null; // Do not launder older intent by silently truncating safety context.
  const context = [];
  for (const turn of tail.reverse()) {
    if (!turn.approvedAt || turn.policyVersion !== SAFETY_POLICY.version) return null;
    const parts = textParts.safeParse(turn.parts);
    if (!parts.success) return null;
    context.push({ role: turn.role,text: parts.data.map((part)=>part.text).join("\n") });
  }
  return context;
}
function interrupted(check: InputCheck, reason: "CANCELLED" | "TIMEOUT"): InputCheck {
  return { ...check, reason, verdict: { decision: "UNAVAILABLE",retryable: false,policyVersion: SAFETY_POLICY.version } };
}
export function createMessageAcceptance(db: AdmissionDatabase, keys: unknown, gate: ReturnType<typeof createInputGate>) {
  const config = parseAdmissionConfig(keys);
  return {
    async accept(subject: string, runId: string, value: unknown, signal: AbortSignal): Promise<InputAcceptance> {
      if (!z.uuid().safeParse(runId).success) return denied("NOT_FOUND");
      const parsed = submissionSchema.safeParse(value);
      if (!parsed.success) return denied("INVALID_INPUT");
      const request = parsed.data; // Independent schema copy; never read caller-owned mutable text again.
      try {
        const claim = await db.transaction(async (tx)=>{
          const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
          verifyPayload(run,request,config);
          if (run.status !== "RECEIVED") return { kind: terminal.includes(run.status) ? "RUN_ALREADY_FINISHED" : "RUN_IN_PROGRESS",runId } as const;
          if (signal.aborted || run.deadlineAt <= now) throw new AdmissionError("SAFETY_UNAVAILABLE");
          if (conversation.revision !== run.admittedRevision) throw new AdmissionError("CONFLICT");
          const context = await loadContext(tx,conversation.id);
          await tx.update(runs).set({ status: "CHECKING_INPUT",updatedAt: now }).where(eq(runs.id,runId));
          return { kind: "CLAIMED",run,context } as const;
        });
        if (claim.kind !== "CLAIMED") return claim;
        // Provider work is outside both short transactions. The claim is never retried automatically.
        const check = await gate.evaluate({ text: request.message.text,context: claim.context },{ signal,deadlineAt: claim.run.deadlineAt });
        return await db.transaction(async (tx): Promise<InputAcceptance> => {
          const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
          verifyPayload(run,request,config);
          if (run.status !== "CHECKING_INPUT" || run.attemptVersion !== claim.run.attemptVersion || conversation.revision !== run.admittedRevision) throw new AdmissionError("CONFLICT");
          const final = signal.aborted ? interrupted(check,"CANCELLED") : run.deadlineAt <= now ? interrupted(check,"TIMEOUT") : check;
          const verdict = guardVerdictSchema.parse(final.verdict);
          const messageId = verdict.decision === "ALLOW" ? randomUUID() : null;
          await tx.insert(inputSafetyReviews).values({ runId,conversationId: conversation.id,attemptVersion: run.attemptVersion,
            decision: verdict.decision,categoryCodes: verdict.decision === "BLOCK" ? verdict.categoryCodes : [],reason: final.reason,
            detectorVersion: INPUT_DETECTOR_VERSION,policyVersion: verdict.policyVersion,modelId: final.modelId,durationMs: final.durationMs,
            acceptedMessageId: messageId,createdAt: now });
          if (messageId) {
            await tx.insert(messages).values({ id: messageId,conversationId: conversation.id,role: "USER",kind: "QUESTION",
              parts: [{ type: "text",text: request.message.text }],sequence: conversation.nextSequence,
              policyVersion: verdict.policyVersion,approvedAt: now,createdAt: now });
            await tx.update(conversations).set({ nextSequence: conversation.nextSequence+1,updatedAt: now,
              ...(conversation.nextSequence === 1 && conversation.title === "New search" ? { title: Array.from(request.message.text.trim().replace(/\s+/gu," ")).slice(0,80).join("") } : {}) }).where(eq(conversations.id,conversation.id));
          }
          const status = verdict.decision === "ALLOW" ? "PLANNING" : verdict.decision === "BLOCK" ? "BLOCKED"
            : final.reason === "CANCELLED" ? "CANCELLED" : final.reason === "TIMEOUT" ? "TIMED_OUT" : "FAILED";
          if (messageId && signal.aborted) throw new AdmissionError("SAFETY_UNAVAILABLE");
          const changed = await tx.update(runs).set({ status,updatedAt: now }).where(and(eq(runs.id,runId),
            eq(runs.status,"CHECKING_INPUT"),eq(runs.attemptVersion,claim.run.attemptVersion),
            messageId ? gt(runs.deadlineAt,sql`clock_timestamp()`) : undefined,
          )).returning({ id: runs.id });
          if (!changed.length || (messageId && signal.aborted)) throw new AdmissionError("SAFETY_UNAVAILABLE");
          if (messageId) return { kind: "ACCEPTED",runId,messageId,revision: run.admittedRevision };
          const decision = resolveSafetyDecision(verdict);
          return { kind: "DENIED",code: verdict.decision === "BLOCK" ? "INPUT_BLOCKED" : "SAFETY_UNAVAILABLE",
            ...(decision.decision !== "ALLOW" ? { response: decision.response } : {}) };
        });
      } catch (error) { if (error instanceof AdmissionError) return denied(error.code); throw error; }
    },
  };
}
