import {isVerifiedNonReasoningModel} from './models';

// Prices are USD / million tokens, pinned to the curated endpoint. Keep this
// server-only policy separate from the user-facing credit price. No fallbacks.
export function answerProviderPolicy(modelId:string,extendedBudget=false) {
 const max_price = !extendedBudget ? {prompt:0.5,completion:2,request:0} : modelId==='google/gemini-3.7-flash' ? {prompt:0.75,completion:3.75,request:0}
  : modelId==='qwen/qwen3.8-max-0902' ? {prompt:2,completion:6,request:0}
  : modelId==='qwen/qwen3.5-397b-a17b' ? {prompt:0.55,completion:3.5,request:0}
  : {prompt:0.5,completion:2,request:0};
 // Qwen supports the reasoning switch without requiring reasoning_effort.
 // No tools are offered and tool_choice remains none on the pinned endpoint.
 const reasoning = modelId==='google/gemini-3.7-flash' ? {enabled:true as const,exclude:true as const,effort:'minimal' as const}
  : isVerifiedNonReasoningModel(modelId) ? undefined
  : modelId==='qwen/qwen3.5-397b-a17b' ? {enabled:false as const,exclude:true as const}
  : {enabled:false as const,exclude:true as const,effort:'none' as const};
 return {max_price,reasoning};
}
