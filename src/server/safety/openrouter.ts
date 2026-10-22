import { providerUsage,type ProviderUsage } from "@/server/ai/usage";
import { z } from "zod";
import type { SafetyModelConfig } from "@/server/ai/models";
import { INPUT_SAFETY_PROMPT } from "./prompt";
import { SAFETY_POLICY, safetyCategorySchema } from "./policy";
import { SafetyProviderError, type SafetyProvider } from "./provider";

const wireSchema = z.strictObject({ decision: z.enum(["ALLOW", "BLOCK", "UNAVAILABLE"]),
  categoryCodes: z.array(safetyCategorySchema).max(11), policyVersion: z.literal(SAFETY_POLICY.version), retryable: z.boolean().nullable(),
}).refine((value)=>new Set(value.categoryCodes).size === value.categoryCodes.length && (value.decision === "UNAVAILABLE"
  ? typeof value.retryable === "boolean" && value.categoryCodes.length === 0
  : value.retryable === null && (value.decision === "ALLOW" ? value.categoryCodes.length === 0 : value.categoryCodes.length > 0)));
const responseSchema = z.object({ usage: z.unknown().optional(),model: z.string().max(128).optional(),error: z.never().optional(), choices: z.array(z.object({ finish_reason: z.literal("stop"),
  message: z.object({ role: z.literal("assistant"), content: z.string().min(1).max(2048),
    tool_calls: z.array(z.never()).max(0).optional(), function_call: z.never().optional(), refusal: z.null().optional() }),
})).length(1) });
const outputSchema = { type: "object", additionalProperties: false,
  required: ["decision","categoryCodes","policyVersion","retryable"], properties: {
    decision: { type: "string", enum: ["ALLOW","BLOCK","UNAVAILABLE"] },
    categoryCodes: { type: "array", items: { type: "string", enum: safetyCategorySchema.options }, maxItems: 11 },
    policyVersion: { type: "string", enum: [SAFETY_POLICY.version] }, retryable: { type: ["boolean","null"] },
  },
};
async function readResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new SafetyProviderError("MALFORMED_OUTPUT");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done,value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) { void reader.cancel().catch(()=>undefined); throw new SafetyProviderError("MALFORMED_OUTPUT"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8",{ fatal: true }).decode(bytes));
}
export function createOpenRouterSafetyProvider(config: SafetyModelConfig, request: typeof fetch = fetch, prompt: string = INPUT_SAFETY_PROMPT): SafetyProvider {
  let usage: ProviderUsage | undefined;
  return {
    usage: ()=>usage,
    modelId: config.modelId,
    async classify(input,signal) {
      usage = undefined;
      const body = JSON.stringify({ model: config.modelId, stream: false, usage: { include: true },max_completion_tokens: 384,
        tools: [], tool_choice: "none", plugins: [], reasoning: { enabled: false, exclude: true },
        provider: { only: [config.provider], allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true,
          max_price: { prompt: 0.1,completion: 0.4,request: 0 } },
        response_format: { type: "json_schema", json_schema: { name: "input_safety_v1", strict: true, schema: outputSchema } },
        messages: [{ role: "system", content: prompt },{ role: "user", content: JSON.stringify(input) }],
      });
      if (Buffer.byteLength(body,"utf8") > 45_000) throw new SafetyProviderError("PROVIDER_UNAVAILABLE");
      let response: Response;
      try {
        response = await request("https://openrouter.ai/api/v1/chat/completions",{
          method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
          cache: "no-store", redirect: "error", credentials: "omit", signal,
          body,
        });
      } catch { throw new SafetyProviderError("PROVIDER_UNAVAILABLE"); }
      if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        void response.body?.cancel().catch(()=>undefined);
        throw new SafetyProviderError("PROVIDER_UNAVAILABLE");
      }
      try {
        const envelope = responseSchema.parse(await readResponse(response));
        usage = providerUsage(envelope.usage,envelope.model);
        const verdict = wireSchema.parse(JSON.parse(envelope.choices[0].message.content));
        return verdict.decision === "UNAVAILABLE"
          ? { decision: verdict.decision, retryable: verdict.retryable, policyVersion: verdict.policyVersion }
          : { decision: verdict.decision, categoryCodes: verdict.categoryCodes, policyVersion: verdict.policyVersion };
      } catch { throw new SafetyProviderError("MALFORMED_OUTPUT"); }
    },
  };
}
