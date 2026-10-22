import { and,eq,inArray,sql } from "drizzle-orm";
import { ACTIVE_RUN_STATUSES,appUsers,runs,session } from "@/db/schema";
import type { SubmitQuery } from "@/server/contracts/chat";
import type { PublicStage } from "@/server/contracts/progress";
import type { PublicErrorCode } from "@/server/contracts/errors";
import type { ChatIdentity } from "@/server/chat/delivery";
import type { AdmissionDatabase } from "./usage";
import type { AdmissionResult } from "./admit";
import type { AnswerProvider } from "@/server/ai/answer";
import type { SafetyProvider } from "@/server/safety/provider";
import type { SearchProvider } from "@/server/search/tavily";
import { createMessageAcceptance } from "./accept-message";
import { createProviderCalls,recordSafetyProvider,recordSearchProvider } from "./provider-calls";
import { createInputGate } from "@/server/safety/input";
import { createEvidenceGate } from "@/server/safety/evidence";
import { createRetrieval } from "@/server/search/retrieve";
import { createAnswerCompletion } from "./complete";
import { createFinalization } from "./finalize";
import { AdmissionError } from "./errors";
import { startRunMonitor } from "./monitor";
type Admitted = Exclude<AdmissionResult,{kind: "DENIED"}>["run"];
export type ExecutionProviders = { input: SafetyProvider;query: SafetyProvider;evidence: SafetyProvider;output: SafetyProvider;answer: AnswerProvider;search: SearchProvider };
export function createRunExecution(db: AdmissionDatabase,keys: unknown,providers: ExecutionProviders) {
  return { async execute(identity: ChatIdentity,run: Admitted,input: SubmitQuery,signal: AbortSignal,onStage: (stage: PublicStage)=>void) {
    const subject = identity.user.id,calls = createProviderCalls(db,subject,run.id);
    const finalization = createFinalization(db);
    const monitor=startRunMonitor(async()=>{
      const [live]=await db.select({id:runs.id}).from(runs).innerJoin(appUsers,eq(appUsers.id,runs.userId))
        .innerJoin(session,and(eq(session.id,identity.sessionId),eq(session.userId,subject),sql`${session.expiresAt}>clock_timestamp()`,sql`${session.createdAt}+interval '30 days'>clock_timestamp()`))
        .where(and(eq(runs.id,run.id),eq(appUsers.authSubject,subject),eq(runs.attemptVersion,1),eq(runs.admittedRevision,run.revision),inArray(runs.status,[...ACTIVE_RUN_STATUSES,'COMPLETED'])));
      return Boolean(live);
    },signal,Date.parse(run.deadlineAt));
    signal=monitor.signal;
    try {
      const accepted = await createMessageAcceptance(db,keys,createInputGate(recordSafetyProvider(calls,"INPUT_SAFETY",providers.input))).accept(subject,run.id,input,signal);
      if (accepted.kind !== "ACCEPTED") throw new AdmissionError(accepted.kind === "DENIED" ? accepted.code : "RUN_IN_PROGRESS");
      const [liveSession] = await db.select({ id: session.id }).from(session).where(and(eq(session.id,identity.sessionId),eq(session.userId,subject),
        sql`${session.expiresAt} > clock_timestamp()`,sql`${session.createdAt} + interval '30 days' > clock_timestamp()`));
      if (!liveSession) throw new AdmissionError("UNAUTHENTICATED");
      onStage("SEARCHING");
      const retrieval = createRetrieval(db,{ modelId: providers.query.modelId,search: recordSearchProvider(calls,providers.search),
        queryGate: createInputGate(recordSafetyProvider(calls,"QUERY_SAFETY",providers.query)),evidenceGate: createEvidenceGate(recordSafetyProvider(calls,"EVIDENCE_SAFETY",providers.evidence)) });
      const retrieved = await retrieval.retrieve(subject,run.id,signal);
      if (retrieved.kind !== "READY" && retrieved.kind !== "NO_EVIDENCE") throw new AdmissionError(retrieved.kind === "DENIED" ? retrieved.code : "RUN_IN_PROGRESS");
      onStage("PREPARING_ANSWER");
      const completion = await createAnswerCompletion(db,{ answer: providers.answer,output: providers.output }).complete(subject,identity.sessionId,run.id,signal,onStage);
      if (completion.kind === "DENIED") throw new AdmissionError(completion.code);
      return { kind: "COMPLETED" } as const;
    } catch (error) {
      const code: PublicErrorCode = error instanceof AdmissionError ? error.code : "PROVIDER_UNAVAILABLE";
      // Called only by the admission winner. Stale callbacks cannot settle a newer attempt.
      await finalization.fail(subject,run.id,code,{ attemptVersion: 1,revision: run.revision },signal.aborted);
      return { kind: "DENIED",code } as const;
    } finally {monitor.stop();}
  } };
}
