import {parseSafetyModel,parsePlannerModel,parseAnswerModel} from '@/server/ai/models';
import {createAnswerProvider,type AnswerProvider} from '@/server/ai/answer';
import {createOpenRouterSafetyProvider} from '@/server/safety/openrouter';
import type {SafetyProvider} from '@/server/safety/provider';
import {EVIDENCE_SAFETY_PROMPT} from '@/server/safety/evidence';
import {OUTPUT_SAFETY_PROMPT} from '@/server/safety/output';
import {createTavilySearch,type SearchProvider} from '@/server/search/tavily';
import {createTavilyExtract,type ExtractProvider} from '@/server/search/extract';
import {createDeepPlanner,type DeepPlanner} from './planner';
import {researchModels,type ResearchSnapshot} from './contracts';
import {JobError} from '@/server/jobs/contracts';
export type DeepProviders={input:SafetyProvider;query:SafetyProvider;evidence:SafetyProvider;output:SafetyProvider;planner:DeepPlanner;answer:AnswerProvider;search:SearchProvider;extract:ExtractProvider};
export function configuredResearchModels(env:Record<string,string|undefined>=process.env){
 const safety=parseSafetyModel(env),planner=parsePlannerModel(env),answer=parseAnswerModel(env);
 if(env.ENABLE_DEEP_RESEARCH!=='true'||!safety||!planner||!answer||!env.TAVILY_API_KEY||env.TAVILY_API_KEY==='disabled')throw new JobError('DISABLED');
 const publicConfig=({modelId,provider}:{modelId:string;provider:string})=>({modelId,provider});
 return researchModels.parse({safety:publicConfig(safety),planner:publicConfig(planner),answer:publicConfig(answer)});
}
export function createDeepProviders(snapshot:ResearchSnapshot,env:Record<string,string|undefined>=process.env,request:typeof fetch=fetch):DeepProviders{
 const configured=configuredResearchModels(env);
 if(JSON.stringify(configured)!==JSON.stringify(snapshot.models))throw new JobError('UNAVAILABLE');
 const safety=parseSafetyModel(env)!,planner=parsePlannerModel(env)!,answer=parseAnswerModel(env)!;
 return {input:createOpenRouterSafetyProvider(safety,request),query:createOpenRouterSafetyProvider(safety,request),
  evidence:createOpenRouterSafetyProvider(safety,request,EVIDENCE_SAFETY_PROMPT),output:createOpenRouterSafetyProvider(safety,request,OUTPUT_SAFETY_PROMPT),
  planner:createDeepPlanner(planner,request),answer:createAnswerProvider(answer,request),search:createTavilySearch(env.TAVILY_API_KEY!,request),extract:createTavilyExtract(env.TAVILY_API_KEY!,request)};
}
