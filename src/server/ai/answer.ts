import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { questionTextSchema } from "@/server/contracts/chat";
import { validateEvidence } from "@/server/search/evidence";
import type { EvidencePackage } from "@/server/contracts/pipeline";
import type { SafetyModelConfig } from "./models";
import { ANSWER_PROMPT } from "./prompts/answer";
import { AnswerError, boundedModelFetch, boundedWork, type ExecutionOptions } from "./bounded";
import { providerUsage, type ProviderUsage } from "./usage";
export type DraftInput = { question: string;evidence: EvidencePackage };
export type PrivateDraft = { text: string;usage: ProviderUsage };
export interface AnswerProvider { readonly modelId?: string;generate(input: DraftInput,options: ExecutionOptions): Promise<PrivateDraft>; usage?(): ProviderUsage | undefined }
export function createAnswerProvider(config: SafetyModelConfig,request: typeof fetch = fetch): AnswerProvider {
  let usage: ProviderUsage | undefined;
  const router = createOpenRouter({ apiKey: config.apiKey,compatibility: "strict",fetch: boundedModelFetch(request) });
  return {
    modelId: config.modelId,
    usage: ()=>usage,
    async generate(input,options) {
      usage = undefined;
      const evidence = validateEvidence(input.evidence),question = questionTextSchema.safeParse(input.question);
      if (!evidence?.sources.length || !question.success) throw new AnswerError();
      return boundedWork(options,12000,async(signal)=>{
        const result = await generateText({ model: router.chat(config.modelId,{
          provider: { only: [config.provider],allow_fallbacks: false,require_parameters: true,data_collection: "deny",zdr: true,
            max_price: { prompt: 0.5,completion: 2,request: 0 } },
          reasoning: { enabled: false,exclude: true,effort: "none" },usage: { include: true },extraBody: { plugins: [] },
        }),system: ANSWER_PROMPT,prompt: JSON.stringify({ question: question.data,
          passages: evidence.passages.map(p=>({ sourceId: p.sourceId,text: p.text })) }),
          maxOutputTokens: 1200,maxRetries: 0,abortSignal: signal,timeout: 12000,tools: {},toolChoice: "none",
          experimental_telemetry: { isEnabled: false,recordInputs: false,recordOutputs: false },
        });
        const meta = result.providerMetadata?.openrouter?.usage;
        usage = providerUsage({ cost: meta && typeof meta === "object" && "cost" in meta ? meta.cost : undefined,prompt_tokens: result.usage.inputTokens,completion_tokens: result.usage.outputTokens },result.response.modelId);
        if (result.finishReason !== "stop" || result.toolCalls.length || !questionTextSchema.safeParse(result.text).success) throw new AnswerError();
        return { text: result.text,usage };
      });
    },
  };
}
