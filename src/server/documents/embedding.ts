import { z } from "zod";
import { microUsd } from "@/server/ai/usage";
import { DOCUMENT_EMBEDDING_DIMENSIONS } from "@/db/document-schema";

// Server-controlled. A change needs every stored chunk re-embedded, so it is a constant.
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
// $0.02 per million tokens, i.e. 0.02 microUSD per token.
const MICRO_USD_PER_TOKEN = 0.02;
const ENDPOINT = "https://openrouter.ai/api/v1/embeddings";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export type EmbeddingResult = { vectors: number[][]; costMicroUsd: bigint | null; model: string };
export interface EmbeddingProvider {
  readonly modelId: string;
  embed(texts: string[], signal: AbortSignal): Promise<EmbeddingResult>;
}
// Embedding costs are often below a millionth of a dollar, which JavaScript prints in
// exponent form (4.6e-7). The shared parser only reads plain decimals.
const plainDecimal = (cost: unknown) => typeof cost === "number" && Number.isFinite(cost) && cost >= 0 && cost < 1000 ? cost.toFixed(12) : cost;
export class EmbeddingError extends Error { constructor() { super("Embedding unavailable"); } }

// A token is at least one UTF-8 byte, so bytes bound the cost before the call is made.
export function embeddingCapMicroUsd(texts: string[]) {
  const bytes = texts.reduce((total, text) => total + new TextEncoder().encode(text).length, 0);
  return BigInt(Math.ceil(bytes * MICRO_USD_PER_TOKEN)) + 1n;
}

const responseSchema = z.object({
  data: z.array(z.object({ index: z.int().min(0), embedding: z.array(z.number().finite()).length(DOCUMENT_EMBEDDING_DIMENSIONS) })),
  model: z.string().max(128).optional(),
  usage: z.object({ cost: z.unknown().optional() }).optional(),
});

// The same privacy routing as the other model calls: zero data retention and no
// training on inputs. Without a matching provider the call fails rather than falling back.
export function createOpenRouterEmbeddings(apiKey: string, request: typeof fetch = fetch, timeoutMs = 20_000): EmbeddingProvider {
  return {
    modelId: EMBEDDING_MODEL,
    async embed(texts, signal) {
      if (!texts.length || texts.length > 128) throw new EmbeddingError();
      let response: Response;
      try {
        response = await request(ENDPOINT, {
          method: "POST", redirect: "manual", credentials: "omit", cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, encoding_format: "float",
            provider: { zdr: true, data_collection: "deny", allow_fallbacks: false } }),
        });
      } catch { throw new EmbeddingError(); }
      const length = Number(response.headers.get("content-length") ?? "0");
      if (!response.ok || length > MAX_RESPONSE_BYTES) { void response.body?.cancel().catch(() => undefined); throw new EmbeddingError(); }
      let parsed: z.infer<typeof responseSchema>;
      try {
        const text = await response.text();
        if (text.length > MAX_RESPONSE_BYTES) throw new EmbeddingError();
        parsed = responseSchema.parse(JSON.parse(text));
      } catch { throw new EmbeddingError(); }
      const ordered = [...parsed.data].sort((a, b) => a.index - b.index);
      if (ordered.length !== texts.length || ordered.some((row, index) => row.index !== index)) throw new EmbeddingError();
      return { vectors: ordered.map(row => row.embedding), costMicroUsd: microUsd(plainDecimal(parsed.usage?.cost)), model: EMBEDDING_MODEL };
    },
  };
}
