import { z } from "zod";
import type { ChatIdentity } from "@/server/chat/delivery";
import { createPublicError, type PublicErrorCode } from "@/server/contracts/errors";
import { AdmissionError } from "@/server/runs/errors";
import { DOCUMENT_LIMITS, DocumentError } from "./limits";
import { documentTitle, type DocumentView } from "./service";

// REST surface for a user's private PDFs:
//   GET    /api/documents            list (bounded by the 20-file quota, so unpaginated)
//   POST   /api/documents            upload: raw application/pdf body, X-File-Name header
//   DELETE /api/documents/:id        idempotent delete
//   GET    /api/documents/:id/file   the original PDF, owner only
export type DocumentsBackend = {
  list(subject: string): Promise<DocumentView[]>;
  upload(subject: string, input: { title: string; bytes: Uint8Array }): Promise<{ created: boolean; document: DocumentView }>;
  remove(subject: string, id: string): Promise<void>;
  file(subject: string, id: string): Promise<{ title: string; bytes: Uint8Array }>;
};
type Identity = ChatIdentity & { user: ChatIdentity["user"] & { isAnonymous?: boolean } };
type Dependencies = {
  identity: (request: Request) => Promise<Identity | null>;
  origin: () => string;
  enabled: () => boolean;
  consumeRequest: (subject: string) => Promise<void>;
  backend: () => DocumentsBackend;
  // Runs after the response is sent: starts embedding the new document.
  afterUpload: (documentId: string) => void;
  log: (event: Record<string, unknown>) => void;
};
const headers = (requestId: string) => ({ "Cache-Control": "private, no-store", "X-Request-Id": requestId, "X-Content-Type-Options": "nosniff" });
const limits = { maxDocuments: DOCUMENT_LIMITS.maxDocuments, maxBytes: DOCUMENT_LIMITS.maxBytes, maxPages: DOCUMENT_LIMITS.maxPages };

function failure(error: unknown, requestId: string) {
  const code: PublicErrorCode = error instanceof DocumentError || error instanceof AdmissionError ? error.code : "CONFIGURATION_UNAVAILABLE";
  const problem = createPublicError(code, requestId);
  return Response.json(problem.body, { status: problem.status, headers: headers(requestId) });
}

async function readPdf(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/pdf") throw new DocumentError("DOCUMENT_UNSUPPORTED");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > DOCUMENT_LIMITS.maxBytes) throw new DocumentError("DOCUMENT_TOO_LARGE");
  if (!request.body) throw new DocumentError("DOCUMENT_UNSUPPORTED");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(DOCUMENT_LIMITS.uploadReadMs)]);
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new AdmissionError("REQUEST_TIMEOUT");
      if (done) break;
      size += value.byteLength;
      if (size > DOCUMENT_LIMITS.maxBytes) { cancel(); throw new DocumentError("DOCUMENT_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  if (!size) throw new DocumentError("DOCUMENT_UNSUPPORTED");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function createDocumentsHttp(dependencies: Dependencies) {
  const log = (event: Record<string, unknown>) => { try { dependencies.log(event); } catch { /* Logging never affects a response. */ } };
  // Guests can't store files: uploads need a real account.
  async function owner(request: Request) {
    if (!dependencies.enabled()) throw new AdmissionError("NOT_FOUND");
    const identity = await dependencies.identity(request);
    if (!identity || identity.user.isAnonymous) throw new AdmissionError("UNAUTHENTICATED");
    return identity.user.id;
  }
  function sameOrigin(request: Request) {
    if (request.headers.get("origin") !== new URL(dependencies.origin()).origin) throw new AdmissionError("INVALID_ORIGIN");
  }
  const documentId = (value: string) => { const parsed = z.uuid().safeParse(value); if (!parsed.success) throw new AdmissionError("NOT_FOUND"); return parsed.data; };

  return {
    async list(request: Request) {
      const requestId = crypto.randomUUID();
      try {
        const subject = await owner(request);
        return Response.json({ data: await dependencies.backend().list(subject), limits }, { headers: headers(requestId) });
      } catch (error) { return failure(error, requestId); }
    },
    async upload(request: Request) {
      const requestId = crypto.randomUUID(), started = performance.now();
      try {
        sameOrigin(request);
        const subject = await owner(request);
        await dependencies.consumeRequest(subject);
        if (new URL(request.url).search) throw new AdmissionError("INVALID_INPUT");
        const bytes = await readPdf(request);
        const result = await dependencies.backend().upload(subject, { title: documentTitle(request.headers.get("x-file-name")), bytes });
        if (result.created) dependencies.afterUpload(result.document.id);
        log({ event: "documents.upload", requestId, outcome: result.created ? "CREATED" : "EXISTING", pages: result.document.pageCount, durationMs: Math.round(performance.now() - started) });
        return Response.json({ data: result.document }, { status: result.created ? 201 : 200,
          headers: { ...headers(requestId), Location: `/api/documents/${result.document.id}` } });
      } catch (error) {
        log({ event: "documents.upload", requestId, outcome: error instanceof DocumentError || error instanceof AdmissionError ? error.code : "UNAVAILABLE", durationMs: Math.round(performance.now() - started) });
        return failure(error, requestId);
      }
    },
    async remove(request: Request, id: string) {
      const requestId = crypto.randomUUID();
      try {
        sameOrigin(request);
        const subject = await owner(request);
        await dependencies.backend().remove(subject, documentId(id));
        return new Response(null, { status: 204, headers: headers(requestId) });
      } catch (error) { return failure(error, requestId); }
    },
    async file(request: Request, id: string) {
      const requestId = crypto.randomUUID();
      try {
        const subject = await owner(request);
        const { title, bytes } = await dependencies.backend().file(subject, documentId(id));
        return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), { headers: { ...headers(requestId), "Content-Type": "application/pdf", "Content-Length": String(bytes.length),
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(title)}` } });
      } catch (error) { return failure(error, requestId); }
    },
  };
}
