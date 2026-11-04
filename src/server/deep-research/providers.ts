import {configuredResearchModels} from './configuration';
import {parsePlannerModel,parseAnswerModel} from '@/server/ai/models';
import {createAnswerProvider,type AnswerProvider} from '@/server/ai/answer';
import {createLocalSafetyGuard} from '@/server/safety/local';
import type {SafetyProvider} from '@/server/safety/provider';
import {createTavilySearch,type SearchProvider} from '@/server/search/tavily';
import {createTavilyExtract,type ExtractProvider} from '@/server/search/extract';
import {createDeepPlanner,type DeepPlanner} from './planner';
import {type ResearchSnapshot} from './contracts';
import {JobError} from '@/server/jobs/contracts';
export type DeepProviders={input:SafetyProvider;query:SafetyProvider;evidence:SafetyProvider;output:SafetyProvider;planner:DeepPlanner;answer:AnswerProvider;search:SearchProvider;extract:ExtractProvider};
export function createDeepProviders(snapshot:ResearchSnapshot,env:Record<string,string|undefined>=process.env,request:typeof fetch=fetch):DeepProviders{
 const configured=configuredResearchModels(env);
 if(JSON.stringify(configured)!==JSON.stringify(snapshot.models))throw new JobError('UNAVAILABLE');
 const planner=parsePlannerModel(env)!,answer=parseAnswerModel(env)!;
 return {input:createLocalSafetyGuard(),query:createLocalSafetyGuard(),
  evidence:createLocalSafetyGuard(),output:createLocalSafetyGuard(),
  planner:createDeepPlanner(planner,request),answer:createAnswerProvider(answer,request,1200,45000),search:createTavilySearch(env.TAVILY_API_KEY!,request),extract:createTavilyExtract(env.TAVILY_API_KEY!,request)};
}
