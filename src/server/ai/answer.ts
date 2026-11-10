import {providerRefused} from './provider-refusal';
import {answerProviderPolicy} from './answer-policy';
import { generateText,Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {draftPrompt,prepareDraftInput} from "./draft-input";
import type { EvidencePackage } from "@/server/contracts/pipeline";
import { type SafetyModelConfig } from "./models";
import { answerSystemPrompt } from "./prompts/answer";
import { AnswerError, ProviderRefusalError, boundedModelFetch, boundedWork, type ExecutionOptions } from "./bounded";
import { providerUsage, type ProviderUsage } from "./usage";
import { citedDraftSchema,renderCitedDraft } from "./cited-draft";
// reader: what the asker has told Perplex about themselves (About you and memories). It shapes
// the answer's tone, depth and units only; it is never evidence and never reaches search.
// learning: memory is on for this chat, so what the person says about themselves is saved after the answer.
export type Reader = { instructions?: string;memories: string[];learning?: boolean };
export type DraftInput = { question: string;context?:Array<{role:"USER"|"ASSISTANT";text:string}>;interpretation?:string;answerLanguage?:string;reader?:Reader;evidence: EvidencePackage };
export type PrivateDraft = { text: string;usage: ProviderUsage };
export interface AnswerProvider { readonly modelId?: string;prepare?(input:DraftInput):DraftInput;generate(input: DraftInput,options: ExecutionOptions): Promise<PrivateDraft>; usage?(): ProviderUsage | undefined }
export function createAnswerProvider(config: SafetyModelConfig,request: typeof fetch = fetch,maxOutputTokens:600|1200=1200,maxDurationMs:12000|45000=12000,extendedBudget=false): AnswerProvider {
  const policy=answerProviderPolicy(config.modelId,extendedBudget);
  let usage: ProviderUsage | undefined;
  const boundedFetch = boundedModelFetch(request);
  const router = createOpenRouter({ apiKey: config.apiKey,compatibility: "strict",fetch: async(url,init)=>{
    const response = await boundedFetch(url,init);
    // Capture the bounded HTTP receipt before SDK structured validation, which
    // can reject a billable completion before returning a GenerateTextResult.
    const envelope = JSON.parse(await response.clone().text());
    usage = providerUsage(envelope?.usage,envelope?.model);
    if(providerRefused(envelope))throw new ProviderRefusalError();
    return response;
  } });
  return {
    modelId: config.modelId,
    usage: ()=>usage,
    prepare: prepareDraftInput,
    async generate(input,options) {
      usage = undefined;
      input=prepareDraftInput(input);const evidence=input.evidence;
      return boundedWork(options,maxDurationMs,async(signal)=>{
        const result = await generateText({ model: router.chat(config.modelId,{
          provider: { only: [config.provider],allow_fallbacks: false,require_parameters: true,data_collection: "deny",zdr: true,
            max_price: policy.max_price },
          usage: { include: true },extraBody: { plugins: [],...(policy.reasoning?{reasoning:policy.reasoning}:{}) },
        }),output: Output.object({schema:citedDraftSchema(evidence)}),system: answerSystemPrompt(input),prompt: draftPrompt(input),
          maxOutputTokens,maxRetries: 0,abortSignal: signal,timeout: maxDurationMs,tools: {},toolChoice: "none",
          experimental_telemetry: { isEnabled: false,recordInputs: false,recordOutputs: false },
        });
        const meta = result.providerMetadata?.openrouter?.usage;
        const reported = providerUsage({ cost: meta && typeof meta === "object" && "cost" in meta ? meta.cost : undefined,prompt_tokens: result.usage.inputTokens,completion_tokens: result.usage.outputTokens },result.response.modelId);
        usage = {...reported,costMicroUsd:reported.costMicroUsd??usage?.costMicroUsd??null};
        if (result.finishReason !== "stop" || result.toolCalls.length) throw new AnswerError();
        return { text: renderCitedDraft(result.output,evidence),usage };
      });
    },
  };
}
