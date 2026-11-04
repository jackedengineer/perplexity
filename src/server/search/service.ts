import "server-only";
import { z } from "zod";
import { createProviderCalls,recordSearchProvider } from "@/server/runs/provider-calls";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/current-session";
import { AdmissionError } from "@/server/runs/errors";
import { createInputGate } from "@/server/safety/input";
import { createEvidenceGate } from "@/server/safety/evidence";
import { createLocalSafetyGuard,LOCAL_GUARD_MODEL } from "@/server/safety/local";
import { createTavilySearch } from "./tavily";
import { createRetrieval, type RetrievalResult } from "./retrieve";

// Internal entry points only. Never add `use server` or expose raw evidence via a route.
export async function retrieveAdmittedEvidence(runId: string,signal: AbortSignal) {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  let result: RetrievalResult;
  try {
    const identity = await getCurrentSession();
    if (!identity) throw new AdmissionError("UNAUTHENTICATED");
    const key = z.string().min(16).max(512).regex(/^[A-Za-z0-9._-]+$/u).safeParse(process.env.TAVILY_API_KEY);
    if (!key.success) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
    const db = getDb(),calls = createProviderCalls(db,identity.user.id,runId);
    const retrieval = createRetrieval(db,{ modelId: LOCAL_GUARD_MODEL.modelId,search: recordSearchProvider(calls,createTavilySearch(key.data)),
      queryGate: createInputGate(createLocalSafetyGuard()),
      evidenceGate: createEvidenceGate(createLocalSafetyGuard()),
    });
    result = await retrieval.retrieve(identity.user.id,runId,signal);
  } catch (error) { result = { kind: "DENIED",code: error instanceof AdmissionError ? error.code : "PROVIDER_UNAVAILABLE" }; }
  console.info(JSON.stringify({
    event: "search.retrieval",
    requestId,
    outcome: result.kind === "DENIED" ? result.code : result.kind,
    durationMs: Math.max(0,Math.round(performance.now()-started)),
  }));
  return { ...result,requestId };
}
export async function loadPrivateEvidence(runId: string) {
  try {
    const identity = await getCurrentSession();
    return identity ? await createRetrieval(getDb()).load(identity.user.id,runId) : null;
  } catch { return null; }
}
