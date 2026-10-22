import { z } from "zod";

// A narrower T07 profile within the T02 FAST ceilings. No model/provider overrides.
export const RETRIEVAL_LIMITS = Object.freeze({ results: 5, queryCharacters: 300, passageCharacters: 1000,
  evidenceBytes: 7500, responseBytes: 100_000, searchMs: 8000, reserveMicroUsd: 15_000n });
export const searchQuerySchema = z.string().min(1).max(RETRIEVAL_LIMITS.queryCharacters)
  .refine((text)=>text.trim().length > 0 && text.isWellFormed() && !/[\u0000-\u001f\u007f-\u009f]/u.test(text));
export type RetrievalOptions = { signal: AbortSignal; deadlineAt: Date };
export class RetrievalError extends Error {
  constructor(readonly code: "PROVIDER_UNAVAILABLE" | "SAFETY_UNAVAILABLE" | "INPUT_BLOCKED" | "OUTPUT_BLOCKED" | "INVALID_INPUT" | "DEADLINE_EXCEEDED" = "PROVIDER_UNAVAILABLE") {
    super("Retrieval unavailable");
  }
}
export async function boundedSearch<T>(options: RetrievalOptions, work: (signal: AbortSignal)=>Promise<T>): Promise<T> {
  const remaining = Math.min(RETRIEVAL_LIMITS.searchMs,options.deadlineAt.getTime()-Date.now());
  if (options.signal.aborted || !Number.isFinite(remaining) || remaining <= 0) throw new RetrievalError();
  const deadline = Date.now()+remaining, controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener("abort",abort,{ once: true });
  const timer = setTimeout(abort,remaining);
  let interrupted!: () => void;
  try {
    const stopped = new Promise<never>((_,reject)=>{
      interrupted = () => reject(new RetrievalError());
      controller.signal.addEventListener("abort",interrupted,{ once: true });
    });
    const result = await Promise.race([Promise.resolve().then(()=>{
      if (controller.signal.aborted) throw new RetrievalError();
      return work(controller.signal);
    }),stopped]);
    if (controller.signal.aborted || options.signal.aborted || Date.now() >= deadline) throw new RetrievalError();
    return result;
  } catch { throw new RetrievalError(); }
  finally {
    clearTimeout(timer); options.signal.removeEventListener("abort",abort);
    controller.signal.removeEventListener("abort",interrupted);
  }
}
