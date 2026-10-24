import {ANSWER_PROMPT_VERSION} from '@/server/ai/prompts/answer';
import {traceStage} from '@/server/telemetry/trace';
import { z } from "zod";
import type { PublicStage } from "@/server/contracts/progress";
import { and,eq } from "drizzle-orm";
import { inputSafetyReviews,messages,outputReviews,runs,runPlans } from "@/db/schema";
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
import {providerDeadline,type ProviderClaim} from './budgets';
export function createAnswerCompletion(db: AdmissionDatabase,dependencies: { answer?: AnswerProvider;output: SafetyProvider }) {
  const finalization = createFinalization(db);
  return { async complete(subject: string,sessionId: string,runId: string,signal: AbortSignal,onStage?: (stage: PublicStage)=>void): Promise<Finalization> {
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
        const [planning]=await tx.select().from(runPlans).where(eq(runPlans.runId,runId));
        const interpretation=planning?.plan.action==='ANSWER'?planning.plan.standaloneQuestion:undefined;
        const answerLanguage=planning?.plan.action==='ANSWER'?planning.plan.answerLanguage:'en';
        return { kind: "READY",run,question: question.data,interpretation,answerLanguage } as const;
      });
      if (loaded.kind === "SAVED") return { kind: "ALREADY_COMMITTED",runId,messageId: loaded.messageId };
      const evidence = await createRetrieval(db).load(subject,runId);
      if (!evidence) throw new AdmissionError("PROVIDER_UNAVAILABLE");
      const draftInput={question:loaded.question,interpretation:loaded.interpretation,answerLanguage:loaded.answerLanguage,evidence};
      const prepared=evidence.sources.length&&dependencies.answer?.prepare?dependencies.answer.prepare(draftInput):draftInput;
      const calls = createProviderCalls(db,subject,runId);
      // The unique ANSWER record is also the one-time private generation claim.
      let claim:ProviderClaim;
      try { claim = await calls.begin("ANSWER",dependencies.answer?.modelId ?? "none",signal); }
      catch (error) { return { kind: "DENIED",code: error instanceof AdmissionError ? error.code : "RUN_IN_PROGRESS" }; }
      const callId=claim.id,budget=providerDeadline(claim,signal);
      ownedAttempt = { attemptVersion: loaded.run.attemptVersion,revision: loaded.run.admittedRevision };
      let draft;
      try {
        if(budget.signal.aborted){await calls.finish(callId,'SKIPPED',{costMicroUsd:0n,inputTokens:0,outputTokens:0,actualModel:null});throw new AdmissionError('DEADLINE_EXCEEDED');}
        draft = await traceStage("answer.draft",()=>generatePrivateDraft(prepared,dependencies.answer,{ signal:budget.signal,deadlineAt:claim.deadlineAt }),()=>({promptVersion:ANSWER_PROMPT_VERSION}));
        await calls.finish(callId,draft.kind === "NO_EVIDENCE" ? "SKIPPED" : "SUCCEEDED",draft.usage);
        if(budget.signal.aborted)throw new AdmissionError('DEADLINE_EXCEEDED');
      } catch {
        try { await calls.finish(callId,"UNKNOWN",dependencies.answer?.usage?.()); } catch { /* Keep unknown attempt held. */ }
        throw new AdmissionError(budget.expired?'DEADLINE_EXCEEDED':signal.aborted?'CONFLICT':"PROVIDER_UNAVAILABLE");
      }finally{budget.stop();}
      await db.transaction(async(tx)=>{
        const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
        if (run.status !== "GENERATING" || run.attemptVersion !== loaded.run.attemptVersion || conversation.revision !== loaded.run.admittedRevision || signal.aborted || run.deadlineAt <= now) throw new AdmissionError("CONFLICT");
        await tx.update(runs).set({ status: "CHECKING_OUTPUT",updatedAt: now }).where(eq(runs.id,runId));
      });
      onStage?.("CHECKING_ANSWER");
      const result = await traceStage("output.release",()=>createReleaseGate(recordSafetyProvider(calls,"OUTPUT_SAFETY",dependencies.output)).approve({ runId,attemptVersion: loaded.run.attemptVersion,
        revision: loaded.run.admittedRevision,kind: draft.kind,question: loaded.question,markdown: draft.text,evidence },{ signal,deadlineAt: loaded.run.deadlineAt }));
      if (result.kind === "DENIED") return finalization.fail(subject,runId,result.code,ownedAttempt,signal.aborted);
      onStage?.("SAVING_ANSWER");
      return await finalization.commit(subject,sessionId,result.response,signal);
    } catch (error) {
      const code = error instanceof AdmissionError ? error.code : "PROVIDER_UNAVAILABLE";
      if (!ownedAttempt || code === "NOT_FOUND" || code === "RUN_IN_PROGRESS") return { kind: "DENIED",code };
      return finalization.fail(subject,runId,code,ownedAttempt,signal.aborted);
    }
  } };
}
