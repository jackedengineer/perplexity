import "server-only";
import { createProviderCalls,recordSafetyProvider } from "@/server/runs/provider-calls";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/current-session";
import { parseSafetyModel } from "@/server/ai/models";
import { createMessageAcceptance, type InputAcceptance } from "@/server/runs/accept-message";
import { parseAdmissionEnvironment } from "@/server/runs/env";
import { AdmissionError } from "@/server/runs/errors";
import { createInputGate } from "./input";
import { createOpenRouterSafetyProvider } from "./openrouter";

// Internal service, not a Server Action or HTTP endpoint. T11 supplies the guarded route.
export async function checkAdmittedInput(runId: string, input: unknown, signal: AbortSignal) {
  const requestId = crypto.randomUUID(), started = performance.now();
  let result: InputAcceptance;
  try {
    const identity = await getCurrentSession();
    if (!identity) throw new AdmissionError("UNAUTHENTICATED");
    const model = parseSafetyModel(process.env);
    const db = getDb();
    const calls = createProviderCalls(db,identity.user.id,runId);
    const gate = createInputGate(model ? recordSafetyProvider(calls,"INPUT_SAFETY",createOpenRouterSafetyProvider(model)) : undefined);
    const acceptance = createMessageAcceptance(db,parseAdmissionEnvironment(process.env),gate);
    result = await acceptance.accept(identity.user.id,runId,input,signal);
  } catch (error) {
    result = { kind: "DENIED",code: error instanceof AdmissionError ? error.code : "SAFETY_UNAVAILABLE" };
  }
  console.info(JSON.stringify({ event: "safety.input",requestId,outcome: result.kind === "DENIED" ? result.code : result.kind,
    durationMs: Math.max(0,Math.round(performance.now()-started)) }));
  return { ...result,requestId };
}
