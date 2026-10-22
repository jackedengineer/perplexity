import { MAX_SUBMISSION_BYTES, submissionSchema } from "@/server/contracts/chat";
import { AdmissionError } from "./errors";

export function isTrustedSubmissionOrigin(request:Request,trustedOrigin:string) {
  return request.method==='POST'&&request.headers.get('origin')===new URL(trustedOrigin).origin;
}
// Invoke after session validation, before admission. A slow body cannot hold a database lock.
export async function readSubmission(request: Request, trustedOrigin: string) {
  if (!isTrustedSubmissionOrigin(request,trustedOrigin)) throw new AdmissionError("INVALID_ORIGIN");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new AdmissionError("UNSUPPORTED_MEDIA_TYPE");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_SUBMISSION_BYTES)) throw new AdmissionError("TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new AdmissionError("MALFORMED_JSON");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5_000)]);
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new AdmissionError("REQUEST_TIMEOUT");
      const { done, value } = await reader.read();
      if (signal.aborted) throw new AdmissionError("REQUEST_TIMEOUT");
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SUBMISSION_BYTES) { cancel(); throw new AdmissionError("TOO_LARGE"); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AdmissionError) throw error;
    throw new AdmissionError("MALFORMED_JSON");
  } finally { signal.removeEventListener("abort", cancel); if (signal.aborted) cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new AdmissionError("MALFORMED_JSON"); }
  const parsed = submissionSchema.safeParse(value);
  if (!parsed.success) throw new AdmissionError("INVALID_INPUT");
  return parsed.data;
}
