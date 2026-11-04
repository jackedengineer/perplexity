import "server-only";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/current-session";
import { parseAnswerModel } from "@/server/ai/models";
import { createAnswerProvider } from "@/server/ai/answer";
import { createLocalSafetyGuard } from "@/server/safety/local";
import { createAnswerCompletion } from "./complete";
import type { Finalization } from "./finalize";
import { AdmissionError } from "./errors";
// Internal, never a Server Action or a public draft endpoint. T11 adds delivery.
export async function completeAdmittedAnswer(runId: string,signal: AbortSignal) {
  const requestId = crypto.randomUUID(),started = performance.now();let result: Finalization;
  try {
    const identity = await getCurrentSession();
    if (!identity) throw new AdmissionError("UNAUTHENTICATED");
    const answer = parseAnswerModel(process.env);
    if (!answer) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
    const service = createAnswerCompletion(getDb(),{ answer: createAnswerProvider(answer),
      output: createLocalSafetyGuard() });
    result = await service.complete(identity.user.id,identity.sessionId,runId,signal);
  } catch (error) { result = { kind: "DENIED",code: error instanceof AdmissionError ? error.code : "PROVIDER_UNAVAILABLE" }; }
  console.info(JSON.stringify({ event: "answer.completion",requestId,outcome: result.kind === "DENIED" ? result.code : result.kind,
    durationMs: Math.max(0,Math.round(performance.now()-started)) }));
  return { ...result,requestId };
}
