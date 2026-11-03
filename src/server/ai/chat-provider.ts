import { generateText,Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {chatPrompt,prepareChatInput,CHAT_PROMPT,chatDraftSchema,renderChatDraft} from "./chat-draft";
import type {AnswerProvider} from "./answer";
import { isVerifiedNonReasoningModel,type SafetyModelConfig } from "./models";
import { AnswerError, boundedModelFetch, boundedWork } from "./bounded";
import { providerUsage, type ProviderUsage } from "./usage";
export function createChatProvider(config: SafetyModelConfig,request: typeof fetch = fetch,maxOutputTokens:600|1200=1200,maxDurationMs:12000|45000=12000): AnswerProvider {
  let usage: ProviderUsage | undefined;
  const boundedFetch = boundedModelFetch(request);
  const router = createOpenRouter({ apiKey: config.apiKey,compatibility: "strict",fetch: async(url,init)=>{
    const response = await boundedFetch(url,init);
    // Capture the bounded HTTP receipt before SDK structured validation, which
    // can reject a billable completion before returning a GenerateTextResult.
    const envelope = JSON.parse(await response.clone().text());
    usage = providerUsage(envelope?.usage,envelope?.model);
    return response;
  } });
  return {
    modelId: config.modelId,
    usage: ()=>usage,
    prepare: prepareChatInput,
    async generate(input,options) {
      usage = undefined;
      input=prepareChatInput(input);
      return boundedWork(options,maxDurationMs,async(signal)=>{
        const result = await generateText({ model: router.chat(config.modelId,{
          provider: { only: [config.provider],allow_fallbacks: false,require_parameters: true,data_collection: "deny",zdr: true,
            max_price: { prompt: 0.5,completion: 2,request: 0 } },
          ...(!isVerifiedNonReasoningModel(config.modelId) ? {reasoning: { enabled: false as const,exclude: true as const,effort: "none" as const }} : {}),
          usage: { include: true },extraBody: { plugins: [] },
        }),output: Output.object({schema:chatDraftSchema}),system: CHAT_PROMPT,prompt: chatPrompt(input),
          maxOutputTokens,maxRetries: 0,abortSignal: signal,timeout: maxDurationMs,tools: {},toolChoice: "none",
          experimental_telemetry: { isEnabled: false,recordInputs: false,recordOutputs: false },
        });
        const meta = result.providerMetadata?.openrouter?.usage;
        const reported = providerUsage({ cost: meta && typeof meta === "object" && "cost" in meta ? meta.cost : undefined,prompt_tokens: result.usage.inputTokens,completion_tokens: result.usage.outputTokens },result.response.modelId);
        usage = {...reported,costMicroUsd:reported.costMicroUsd??usage?.costMicroUsd??null};
        if (result.finishReason !== "stop" || result.toolCalls.length) throw new AnswerError();
        return { text: renderChatDraft(result.output,input),usage };
      });
    },
  };
}
