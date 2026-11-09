import { generateText, Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { ProviderRefusalError, boundedModelFetch, boundedWork, type ExecutionOptions } from "@/server/ai/bounded";
import { isVerifiedNonReasoningModel, type SafetyModelConfig } from "@/server/ai/models";
import { providerRefused } from "@/server/ai/provider-refusal";
import { providerUsage, type ProviderUsage } from "@/server/ai/usage";
import { MEMORY_PROMPT } from "./prompt";
import type { MemoryOperation, StoredMemory } from "./store";

export const EXTRACTION_LIMITS = Object.freeze({ wireBytes: 16_000, maxOutputTokens: 400, maxDurationMs: 8000, operations: 3 });
export type ExtractionFailure = "INPUT_TOO_LARGE" | "TIMEOUT" | "REFUSED" | "INVALID_OUTPUT" | "UNAVAILABLE";
export class ExtractionError extends Error { constructor(readonly reason: ExtractionFailure) { super("Memory extraction unavailable"); } }
export type ExtractionInput = { message: string; memories: readonly StoredMemory[] };
export interface ExtractionProvider {
  readonly modelId: string;
  extract(input: ExtractionInput, options: ExecutionOptions): Promise<{ operations: MemoryOperation[]; usage: ProviderUsage | undefined }>;
  usage?(): ProviderUsage | undefined;
}

// The model sees short ids (m1, m2…) rather than database ids: fewer tokens, nothing to copy wrong.
const text = z.string().min(3).max(200);
export const extractionSchema = z.strictObject({ operations: z.array(z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("ADD"), kind: z.enum(["PROFILE", "PREFERENCE", "CONTEXT"]), text }),
  z.strictObject({ op: z.literal("UPDATE"), id: z.string().max(8), text }),
  z.strictObject({ op: z.literal("DELETE"), id: z.string().max(8) }),
])).max(EXTRACTION_LIMITS.operations) });

// Newest memories first; the oldest are left out if the request would pass the wire cap.
export function extractionPayload(input: ExtractionInput) {
  const memories = input.memories.map((memory, index) => ({ id: `m${index + 1}`, kind: memory.kind, text: memory.text }));
  for (let count = memories.length; count >= 0; count--) {
    const prompt = JSON.stringify({ message: input.message, memories: memories.slice(0, count) });
    // System prompt, the JSON schema and SDK fields travel too; 4 KB covers them.
    if (Buffer.byteLength(JSON.stringify({ system: MEMORY_PROMPT, prompt }), "utf8") + 4096 <= EXTRACTION_LIMITS.wireBytes) return { prompt, ids: input.memories.slice(0, count).map(memory => memory.id) };
  }
  throw new ExtractionError("INPUT_TOO_LARGE");
}

// Maps the model's short ids back. Unknown short ids become "" and are dropped by checkOperations.
export function resolveOperations(output: z.infer<typeof extractionSchema>, ids: readonly string[]): MemoryOperation[] {
  const real = (short: string) => /^m\d{1,2}$/u.test(short) ? ids[Number(short.slice(1)) - 1] ?? "" : "";
  return output.operations.map(operation => operation.op === "ADD" ? operation : { ...operation, id: real(operation.id) });
}

export function createExtractionProvider(config: SafetyModelConfig, request: typeof fetch = fetch): ExtractionProvider {
  let usage: ProviderUsage | undefined;
  const router = createOpenRouter({ apiKey: config.apiKey, compatibility: "strict", fetch: async (url, init) => {
    const response = await boundedModelFetch(request, EXTRACTION_LIMITS.wireBytes)(url, init);
    const envelope = JSON.parse(await response.clone().text());
    usage = providerUsage(envelope?.usage, envelope?.model);
    if (providerRefused(envelope)) throw new ProviderRefusalError();
    return response;
  } });
  return { modelId: config.modelId, usage: () => usage, async extract(input, options) {
    usage = undefined;
    const { prompt, ids } = extractionPayload(input);
    try {
      return await boundedWork(options, EXTRACTION_LIMITS.maxDurationMs, async signal => {
        const result = await generateText({ model: router.chat(config.modelId, {
          provider: { only: [config.provider], allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true, max_price: { prompt: .075, completion: .2, request: 0 } },
          ...(!isVerifiedNonReasoningModel(config.modelId) ? { reasoning: { enabled: false as const, exclude: true as const, effort: "none" as const } } : {}), usage: { include: true }, extraBody: { plugins: [] },
        }), output: Output.object({ schema: extractionSchema }), system: MEMORY_PROMPT, prompt,
        temperature: 0, maxOutputTokens: EXTRACTION_LIMITS.maxOutputTokens, maxRetries: 0, abortSignal: signal, timeout: EXTRACTION_LIMITS.maxDurationMs, tools: {}, toolChoice: "none",
        experimental_telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false } });
        const meta = result.providerMetadata?.openrouter?.usage;
        const reported = providerUsage({ cost: meta && typeof meta === "object" && "cost" in meta ? meta.cost : undefined, prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens }, result.response.modelId);
        usage = { ...reported, costMicroUsd: reported.costMicroUsd ?? usage?.costMicroUsd ?? null };
        if (result.finishReason !== "stop" || result.toolCalls.length) throw new ExtractionError("INVALID_OUTPUT");
        return { operations: resolveOperations(result.output, ids), usage };
      });
    } catch (error) {
      if (error instanceof ExtractionError) throw error;
      if (error instanceof ProviderRefusalError) throw new ExtractionError("REFUSED");
      if (options.signal.aborted) throw new ExtractionError("UNAVAILABLE");
      throw new ExtractionError(error instanceof Error && /time|abort/iu.test(error.name + error.message) ? "TIMEOUT" : usage ? "INVALID_OUTPUT" : "UNAVAILABLE");
    }
  } };
}
