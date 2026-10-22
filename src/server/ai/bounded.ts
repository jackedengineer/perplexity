export type ExecutionOptions = { signal: AbortSignal; deadlineAt: Date };
export class AnswerError extends Error { constructor() { super("Answer unavailable"); } }
export async function boundedWork<T>(options: ExecutionOptions,limitMs: number,work: (signal: AbortSignal)=>Promise<T>): Promise<T> {
  const remaining = Math.min(limitMs,options.deadlineAt.getTime()-Date.now());
  if (options.signal.aborted || !Number.isFinite(remaining) || remaining <= 0) throw new AnswerError();
  const deadline = Date.now()+remaining,controller = new AbortController(),abort = ()=>controller.abort();
  options.signal.addEventListener("abort",abort,{ once: true });
  const timer = setTimeout(abort,remaining); let stop!: ()=>void;
  try {
    const interrupted = new Promise<never>((_,reject)=>{ stop = ()=>reject(new AnswerError()); controller.signal.addEventListener("abort",stop,{ once: true }); });
    const result = await Promise.race([Promise.resolve().then(()=>{ if (controller.signal.aborted) throw new AnswerError(); return work(controller.signal); }),interrupted]);
    if (controller.signal.aborted || options.signal.aborted || Date.now() >= deadline) throw new AnswerError();
    return result;
  } catch { throw new AnswerError(); }
  finally { clearTimeout(timer); options.signal.removeEventListener("abort",abort);controller.signal.removeEventListener("abort",stop); }
}
export function boundedModelFetch(request: typeof fetch): typeof fetch {
  return async(url,init)=>{
    if (String(url) !== "https://openrouter.ai/api/v1/chat/completions" || typeof init?.body !== "string" || Buffer.byteLength(init.body) > 20000) throw new AnswerError();
    const response = await request(url,{ ...init,redirect: "error",credentials: "omit",cache: "no-store" });
    if (!response.ok || init.signal?.aborted || response.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
      void response.body?.cancel().catch(()=>undefined); throw new AnswerError();
    }
    const reader = response.body?.getReader(); if (!reader) throw new AnswerError();
    const cancel = ()=>{ void reader.cancel().catch(()=>undefined); }; init.signal?.addEventListener("abort",cancel,{ once: true });
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done,value } = await reader.read(); if (init.signal?.aborted) throw new AnswerError(); if (done) break;
        size += value.byteLength; if (size > 24000) { cancel(); throw new AnswerError(); } chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
      return new Response(bytes,{ status: response.status,headers: { "content-type": "application/json" } });
    } finally { init.signal?.removeEventListener("abort",cancel);reader.releaseLock(); }
  };
}
