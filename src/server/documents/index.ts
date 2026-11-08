import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/current-session";
import { getServerEnv } from "@/lib/env";
import { createPublicError } from "@/server/contracts/errors";
import { AdmissionError } from "@/server/runs/errors";
import { parseAdmissionPolicyEnvironment } from "@/server/runs/env";
import { createRequestLimiter } from "@/server/runs/rate-limit";
import { createOpenRouterEmbeddings } from "./embedding";
import { createDocumentsHttp } from "./http";
import { createDocumentService } from "./service";
import { createFileDocumentStore, createR2DocumentStore, type DocumentStore } from "./storage";

export const documentsEnabled = () => process.env.ENABLE_DOCUMENTS === "true";

function documentStore(): DocumentStore {
  if (process.env.DEPLOYMENT_PLATFORM === "cloudflare") {
    const bucket = (getCloudflareContext().env as { DOCUMENTS_BUCKET?: Parameters<typeof createR2DocumentStore>[0] }).DOCUMENTS_BUCKET;
    if (!bucket) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
    return createR2DocumentStore(bucket);
  }
  // Node (local development and browser tests) keeps files in an ignored directory.
  const root = process.env.DOCUMENT_STORE_DIR;
  if (!root) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
  return createFileDocumentStore(root);
}

export function embeddingProvider() {
  const key = z.string().min(16).max(512).regex(/^[A-Za-z0-9._-]+$/u).safeParse(process.env.OPENROUTER_API_KEY);
  if (!key.success) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
  return createOpenRouterEmbeddings(key.data);
}

const operatorBudgetKey = () => parseAdmissionPolicyEnvironment(process.env).operatorBudgetKey;
export const documentService = () => createDocumentService(getDb(), { store: documentStore(), operatorBudgetKey: operatorBudgetKey() });

// Embeds one new document straight away. Anything unfinished is picked up by the scheduled sweep.
async function embedSoon(documentId: string) {
  try {
    await documentService().embedPending(embeddingProvider(), { deadline: performance.now() + 25_000, documentId });
  } catch { console.info(JSON.stringify({ event: "documents.embedding", outcome: "DEFERRED" })); }
}

export const documentsHttp = createDocumentsHttp({
  identity: getCurrentSession,
  origin: () => getServerEnv().BETTER_AUTH_URL,
  enabled: documentsEnabled,
  consumeRequest: subject => createRequestLimiter(getDb(), "documents-upload-v1", { userMinute: 10, userDay: 60, anonymousMinute: 1, anonymousDay: 1 }).consume("documents:" + subject),
  backend: documentService,
  afterUpload: documentId => after(() => embedSoon(documentId)),
  log: event => console.info(JSON.stringify(event)),
});

// Scheduled backstop: finishes any document whose background embedding was cut short.
export async function documentsCron(request: Request) {
  const requestId = crypto.randomUUID();
  const fail = (code: "UNAUTHENTICATED" | "CONFIGURATION_UNAVAILABLE" | "INVALID_INPUT") => {
    const problem = createPublicError(code, requestId);
    return Response.json(problem.body, { status: problem.status, headers: { "Cache-Control": "private, no-store" } });
  };
  const secret = process.env.CRON_SECRET;
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/u.test(secret)) return fail("CONFIGURATION_UNAVAILABLE");
  const supplied = request.headers.get("authorization") ?? "";
  if (supplied.length > 512 || !timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update("Bearer " + secret).digest())) return fail("UNAUTHENTICATED");
  if (request.method !== "GET" || new URL(request.url).search) return fail("INVALID_INPUT");
  if (!documentsEnabled()) return Response.json({ embedded: 0, failed: 0 }, { headers: { "Cache-Control": "private, no-store" } });
  try {
    const result = await documentService().embedPending(embeddingProvider(), { deadline: performance.now() + 20_000 });
    console.info(JSON.stringify({ event: "documents.embedding", requestId, ...result }));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return fail("CONFIGURATION_UNAVAILABLE"); }
}
