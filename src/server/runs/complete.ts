import { z } from "zod";
import { and,eq } from "drizzle-orm";
import { inputSafetyReviews,messages,outputReviews,runs } from "@/db/schema";
import type { AdmissionDatabase } from "./usage";
import { lockOwnedRun } from "./lock";
import { AdmissionError } from "./errors";
import { createProviderCalls,recordSafetyProvider } from "./provider-calls";
import { createRetrieval } from "@/server/search/retrieve";
import { generatePrivateDraft } from "./draft";
import { createReleaseGate } from "@/server/safety/release";
import { lockCompletionSession,createFinalization,type Finalization } from "./finalize";
import type { AnswerProvider } from "@/server/ai/answer";
import type { SafetyProvider } from "@/server/safety/provider";
import { SAFETY_POLICY } from "@/server/safety/policy";
import { questionTextSchema } from "@/server/contracts/chat";
export function createAnswerCompletion(db: AdmissionDatabase,dependencies: { answer?: AnswerProvider;output: SafetyProvider }) {
  const finalization = createFinalization(db);
  return { async complete(subject: string,sessionId: string,runId: string,signal: AbortSignal): Promise<Finalization> {
    if (!z.uuid().safeParse(runId).success) return { kind: "DENIED",code: "NOT_FOUND" };
    let ownedAttempt: { attemptVersion: number;revision: number } | undefined;
    try {
      const loaded = await db.transaction(async(tx)=>{
        const current = await lockCompletionSession(tx,subject,sessionId);
        const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
        if (current.expiresAt <= now || current.createdAt.getTime()+30*86400000 <= now.getTime()) throw new AdmissionError("UNAUTHENTICATED");
        const [saved] = await tx.select().from(outputReviews).where(eq(outputReviews.runId,runId));
        if (run.status === "COMPLETED" && saved?.decision === "ALLOW" && saved.messageId) return { kind: "SAVED",messageId: saved.messageId } as const;
        if (run.status !== "GENERATING") throw new AdmissionError("RUN_IN_PROGRESS");
        if (signal.aborted || run.deadlineAt <= now || conversation.revision !== run.admittedRevision || run.policyVersion !== SAFETY_POLICY.version) throw new AdmissionError("CONFLICT");
        const [review] = await tx.select().from(inputSafetyReviews).where(and(eq(inputSafetyReviews.runId,runId),eq(inputSafetyReviews.decision,"ALLOW")));
        if (!review?.acceptedMessageId || review.policyVersion !== SAFETY_POLICY.version || review.attemptVersion !== run.attemptVersion) throw new AdmissionError("SAFETY_UNAVAILABLE");
        const [message] = await tx.select().from(messages).where(and(eq(messages.id,review.acceptedMessageId),eq(messages.conversationId,run.conversationId)));
        const question = questionTextSchema.safeParse(message?.parts[0]?.text);
        if (!question.success || !message?.approvedAt || message.parts.length !== 1 || message.policyVersion !== run.policyVersion) throw new AdmissionError("SAFETY_UNAVAILABLE");
        return { kind: "READY",run,question: question.data } as const;
      });
      if (loaded.kind === "SAVED") return { kind: "ALREADY_COMMITTED",runId,messageId: loaded.messageId };
      const evidence = await createRetrieval(db).load(subject,runId);
      if (!evidence) throw new AdmissionError("PROVIDER_UNAVAILABLE");
      const calls = createProviderCalls(db,subject,runId);
      // The unique ANSWER record is also the one-time private generation claim.
      let callId: string;
      try { callId = await calls.begin("ANSWER",dependencies.answer?.modelId ?? "none"); }
      catch (error) { return { kind: "DENIED",code: error instanceof AdmissionError ? error.code : "RUN_IN_PROGRESS" }; }
      ownedAttempt = { attemptVersion: loaded.run.attemptVersion,revision: loaded.run.admittedRevision };
      let draft;
      try {
        draft = await generatePrivateDraft({ question: loaded.question,evidence },dependencies.answer,{ signal,deadlineAt: loaded.run.deadlineAt });
        await calls.finish(callId,draft.kind === "NO_EVIDENCE" ? "SKIPPED" : "SUCCEEDED",draft.usage);
      } catch {
        try { await calls.finish(callId,"UNKNOWN",dependencies.answer?.usage?.()); } catch { /* Keep unknown attempt held. */ }
        throw new AdmissionError("PROVIDER_UNAVAILABLE");
      }
      await db.transaction(async(tx)=>{
        const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
        if (run.status !== "GENERATING" || run.attemptVersion !== loaded.run.attemptVersion || conversation.revision !== loaded.run.admittedRevision || signal.aborted || run.deadlineAt <= now) throw new AdmissionError("CONFLICT");
        await tx.update(runs).set({ status: "CHECKING_OUTPUT",updatedAt: now }).where(eq(runs.id,runId));
      });
      const result = await createReleaseGate(recordSafetyProvider(calls,"OUTPUT_SAFETY",dependencies.output)).approve({ runId,attemptVersion: loaded.run.attemptVersion,
        revision: loaded.run.admittedRevision,kind: draft.kind,question: loaded.question,markdown: draft.text,evidence },{ signal,deadlineAt: loaded.run.deadlineAt });
      if (result.kind === "DENIED") return finalization.fail(subject,runId,result.code,ownedAttempt);
      return await finalization.commit(subject,sessionId,result.response,signal);
    } catch (error) {
      const code = error instanceof AdmissionError ? error.code : "PROVIDER_UNAVAILABLE";
      if (!ownedAttempt || code === "NOT_FOUND" || code === "RUN_IN_PROGRESS") return { kind: "DENIED",code };
      return finalization.fail(subject,runId,code,ownedAttempt);
    }
  } };
}
