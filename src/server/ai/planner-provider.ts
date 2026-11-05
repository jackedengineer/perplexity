import {generateText,NoObjectGeneratedError,NoOutputGeneratedError,Output} from 'ai';
import {z} from 'zod';
import {createOpenRouter} from '@openrouter/ai-sdk-provider';
import {queryPlanSchema,type QueryPlan} from '@/server/contracts/pipeline';
import {STAGE_LIMITS} from '@/server/runs/budgets';
import {ProviderRefusalError,boundedModelFetch,boundedWork,type ExecutionOptions} from './bounded';
import {isVerifiedNonReasoningModel,type SafetyModelConfig} from './models';
import {providerRefused} from './provider-refusal';
import {PLANNER_LIMITS,plannerInputSchema,clarifyUnresolvedReference,resolvePricingFollowup,standaloneFallback,validatePlan,PlanningError,type PlannerFailure,type PlannerInput} from './plan';
import {providerUsage,type ProviderUsage} from './usage';
import {PLANNER_PROMPT} from './prompts/planner';
export interface PlannerProvider {readonly modelId:string;plan(input:PlannerInput,options:ExecutionOptions):Promise<{plan:QueryPlan;usage:ProviderUsage;engine?:"MODEL"|"CONTEXT_RULE"}>;usage?():ProviderUsage|undefined}
export function createPlannerProvider(config:SafetyModelConfig,request:typeof fetch=fetch):PlannerProvider{
 let usage:ProviderUsage|undefined,httpStatus:number|undefined;
 const limitMs=STAGE_LIMITS.PLANNER.maxDurationMs;
 const observedRequest:typeof fetch=async(url,init)=>{const response=await request(url,init);httpStatus=response.status;return response;};
 const failureOf=(error:unknown):PlannerFailure=>{
  if(error instanceof PlanningError)return error.reason;
  if(error instanceof ProviderRefusalError)return 'PROVIDER_REFUSED';
  // Structured output was required, so prose with no JSON at all is usually the model declining.
  if(NoObjectGeneratedError.isInstance(error)&&error.text?.trim()&&!error.text.includes('{'))return 'OUTPUT_NOT_JSON';
  if(NoObjectGeneratedError.isInstance(error)||NoOutputGeneratedError.isInstance(error)||error instanceof SyntaxError)return 'OUTPUT_UNPARSEABLE';
  return httpStatus!==undefined&&(httpStatus<200||httpStatus>=300)?'HTTP_ERROR':'TRANSPORT';
 };
 const boundedFetch=boundedModelFetch(observedRequest,PLANNER_LIMITS.wireBytes),router=createOpenRouter({apiKey:config.apiKey,compatibility:'strict',fetch:async(url,init)=>{
  if(typeof init?.body!=='string'||Buffer.byteLength(init.body,'utf8')>PLANNER_LIMITS.wireBytes)throw new PlanningError('INPUT_INVALID');
  const response=await boundedFetch(url,init),envelope=JSON.parse(await response.clone().text());
  usage=providerUsage(envelope?.usage,envelope?.model);
  if(providerRefused(envelope))throw new ProviderRefusalError();
  return response;
 }});
 return {modelId:config.modelId,usage:()=>usage,async plan(input,options){
  usage=undefined;httpStatus=undefined;
  const parsed=plannerInputSchema.safeParse(input);
  if(!parsed.success)throw new PlanningError('INPUT_INVALID');
  const canonical=parsed.data;
  if(options.signal.aborted||options.deadlineAt.getTime()<=Date.now())throw new PlanningError('NOT_DISPATCHED');
  const local=clarifyUnresolvedReference(canonical)??resolvePricingFollowup(canonical)??standaloneFallback(canonical);
  if(local){usage={costMicroUsd:0n,inputTokens:0,outputTokens:0,actualModel:null};return {plan:local,usage,engine:'CONTEXT_RULE'};}
  const limitAt=Math.min(Date.now()+limitMs,options.deadlineAt.getTime());let failure:PlannerFailure|undefined;
  const generated=await boundedWork(options,limitMs,async(signal)=>{
   try{
    const result=await generateText({model:router.chat(config.modelId,{
     provider:{only:[config.provider],allow_fallbacks:false,require_parameters:true,data_collection:'deny',zdr:true,max_price:{prompt:.075,completion:.2,request:0}},
     ...(!isVerifiedNonReasoningModel(config.modelId)?{reasoning:{enabled:false as const,exclude:true as const,effort:'none' as const}}:{}),usage:{include:true},extraBody:{plugins:[]},
    }),output:Output.object({schema:z.strictObject({plan:queryPlanSchema})}),system:PLANNER_PROMPT,prompt:JSON.stringify(canonical),
    temperature:0,maxOutputTokens:1024,maxRetries:0,abortSignal:signal,timeout:limitMs,tools:{},toolChoice:'none',experimental_telemetry:{isEnabled:false,recordInputs:false,recordOutputs:false}});
    const meta=result.providerMetadata?.openrouter?.usage,reported=providerUsage({cost:meta&&typeof meta==='object'&&'cost'in meta?meta.cost:undefined,prompt_tokens:result.usage.inputTokens,completion_tokens:result.usage.outputTokens},result.response.modelId);
    const known={...reported,costMicroUsd:reported.costMicroUsd??usage?.costMicroUsd??null};usage=known;
    if(result.finishReason!=='stop'||result.toolCalls.length){failure='FINISH_REASON';throw new PlanningError(failure);}
    return {value:result.output.plan,usage:known};
   }catch(error){failure??=failureOf(error);throw error;}
  }).catch((error:unknown)=>{
   // boundedWork erases error types, and its timer can win the race before the attempt above sees the abort.
   throw new PlanningError(failure??(options.signal.aborted||Date.now()>=limitAt?'TIMEOUT':failureOf(error)),httpStatus);
  });
  return {plan:validatePlan(generated.value,canonical,2),usage:generated.usage,engine:'MODEL' as const};
 }};
}
