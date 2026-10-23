import { providerUsage,type ProviderUsage } from "@/server/ai/usage";
import { z } from "zod";
import { isVerifiedNonReasoningModel,type SafetyModelConfig } from "@/server/ai/models";
import { INPUT_SAFETY_PROMPT } from "./prompt";
import { SAFETY_POLICY, safetyCategorySchema } from "./policy";
import { SafetyProviderError, type SafetyProvider } from "./provider";

const classificationSchema = z.union([z.enum(["ALLOW","UNAVAILABLE"]),z.array(safetyCategorySchema).min(1).max(11)
  .refine(categories=>new Set(categories).size===categories.length)]);
const wireSchema = z.strictObject({classification:classificationSchema,policyVersion:z.literal(SAFETY_POLICY.version)});
const responseSchema = z.object({ usage: z.unknown().optional(),model: z.string().max(128).optional(),error: z.never().optional(), choices: z.array(z.object({ finish_reason: z.literal("stop"),
  message: z.object({ role: z.literal("assistant"), content: z.string().min(1).max(2048),
    tool_calls: z.array(z.never()).max(0).optional(), function_call: z.never().optional(), refusal: z.null().optional() }),
})).length(1) });
const outputSchema = { type: "object", additionalProperties: false,
  required: ["classification","policyVersion"], properties: {
    classification: { anyOf: [{type:"string",enum:["ALLOW","UNAVAILABLE"]},
      {type:"array",items:{type:"string",enum:safetyCategorySchema.options},minItems:1,maxItems:11}] },
    policyVersion: { type: "string", enum: [SAFETY_POLICY.version] },
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
      const body = JSON.stringify({ model: config.modelId, stream: false,temperature:0, usage: { include: true },max_completion_tokens: 384,
        tools: [], tool_choice: "none", plugins: [],
        ...(!isVerifiedNonReasoningModel(config.modelId) ? {reasoning: { enabled: false, exclude: true }} : {}),
        provider: { only: [config.provider], allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true,
          max_price: { prompt: 0.1,completion: 0.4,request: 0 } },
        response_format: { type: "json_schema", json_schema: { name: "research_safety_v3", strict: true, schema: outputSchema } },
        messages: [{ role: "system", content: prompt },{ role: "user", content: JSON.stringify(input) }],
      });
      if (Buffer.byteLength(body,"utf8") > 20_000) throw new SafetyProviderError("PROVIDER_UNAVAILABLE");
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
        const value = await readResponse(response);
        // A filtered/invalid verdict is still billable. Preserve only validated
        // receipt fields without treating the completion as an approved verdict.
        const receipt = z.object({usage:z.unknown().optional(),model:z.unknown().optional()}).safeParse(value);
        if(receipt.success)usage = providerUsage(receipt.data.usage,receipt.data.model);
        const envelope = responseSchema.parse(value);
        const verdict = wireSchema.parse(JSON.parse(envelope.choices[0].message.content));
        if(verdict.classification === "UNAVAILABLE")return {decision:"UNAVAILABLE",retryable:false,policyVersion:verdict.policyVersion};
        return {decision:verdict.classification === "ALLOW"?"ALLOW":"BLOCK",
          categoryCodes:verdict.classification === "ALLOW"?[]:verdict.classification,policyVersion:verdict.policyVersion};
      } catch { throw new SafetyProviderError("MALFORMED_OUTPUT"); }
    },
  };
}
