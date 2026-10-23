import {generateText,Output} from 'ai';
import {z} from 'zod';
import {createOpenRouter} from '@openrouter/ai-sdk-provider';
import {queryPlanSchema,type QueryPlan} from '@/server/contracts/pipeline';
import {boundedModelFetch,boundedWork,type ExecutionOptions} from './bounded';
import {isVerifiedNonReasoningModel,type SafetyModelConfig} from './models';
import {plannerInputSchema,clarifyUnresolvedReference,resolvePricingFollowup,validatePlan,PlanningError,type PlannerInput} from './plan';
import {providerUsage,type ProviderUsage} from './usage';
import {PLANNER_PROMPT} from './prompts/planner';
export interface PlannerProvider {readonly modelId:string;plan(input:PlannerInput,options:ExecutionOptions):Promise<{plan:QueryPlan;usage:ProviderUsage;engine?:"MODEL"|"CONTEXT_RULE"}>;usage?():ProviderUsage|undefined}
export function createPlannerProvider(config:SafetyModelConfig,request:typeof fetch=fetch):PlannerProvider{
 let usage:ProviderUsage|undefined;
 const boundedFetch=boundedModelFetch(request),router=createOpenRouter({apiKey:config.apiKey,compatibility:'strict',fetch:async(url,init)=>{
  const response=await boundedFetch(url,init),envelope=JSON.parse(await response.clone().text());
  usage=providerUsage(envelope?.usage,envelope?.model);return response;
 }});
 return {modelId:config.modelId,usage:()=>usage,async plan(input,options){
  usage=undefined;
  try{
   const canonical=plannerInputSchema.parse(input);
   if(options.signal.aborted||options.deadlineAt.getTime()<=Date.now())throw new PlanningError();
   const local=clarifyUnresolvedReference(canonical)??resolvePricingFollowup(canonical);
   if(local){usage={costMicroUsd:0n,inputTokens:0,outputTokens:0,actualModel:null};return {plan:local,usage,engine:'CONTEXT_RULE'};}
   return await boundedWork(options,5000,async(signal)=>{
    const result=await generateText({model:router.chat(config.modelId,{
     provider:{only:[config.provider],allow_fallbacks:false,require_parameters:true,data_collection:'deny',zdr:true,max_price:{prompt:.075,completion:.2,request:0}},
     ...(!isVerifiedNonReasoningModel(config.modelId)?{reasoning:{enabled:false as const,exclude:true as const,effort:'none' as const}}:{}),usage:{include:true},extraBody:{plugins:[]},
    }),output:Output.object({schema:z.strictObject({plan:queryPlanSchema})}),system:PLANNER_PROMPT,prompt:JSON.stringify(canonical),
    temperature:0,maxOutputTokens:1024,maxRetries:0,abortSignal:signal,timeout:5000,tools:{},toolChoice:'none',experimental_telemetry:{isEnabled:false,recordInputs:false,recordOutputs:false}});
    const meta=result.providerMetadata?.openrouter?.usage,reported=providerUsage({cost:meta&&typeof meta==='object'&&'cost'in meta?meta.cost:undefined,prompt_tokens:result.usage.inputTokens,completion_tokens:result.usage.outputTokens},result.response.modelId);
    usage={...reported,costMicroUsd:reported.costMicroUsd??usage?.costMicroUsd??null};
    if(result.finishReason!=='stop'||result.toolCalls.length)throw new PlanningError();
    return {plan:validatePlan(result.output.plan,canonical,2),usage,engine:'MODEL' as const};
   });
  }catch{throw new PlanningError();}
 }};
}
