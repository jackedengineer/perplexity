import {createConsensusProvider,type ConsensusProvider} from './consensus-provider';
import {CONSENSUS_MODELS} from './consensus-models';
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
export type DeepProviders={consensus?:ConsensusProvider;input:SafetyProvider;query:SafetyProvider;evidence:SafetyProvider;output:SafetyProvider;planner:DeepPlanner;answer:AnswerProvider;search:SearchProvider;extract:ExtractProvider};
export function createDeepProviders(snapshot:ResearchSnapshot,env:Record<string,string|undefined>=process.env,request:typeof fetch=fetch):DeepProviders{
 const configured=configuredResearchModels(env);
 if(snapshot.version==='deep-research-v1'&&JSON.stringify(configured)!==JSON.stringify(snapshot.models))throw new JobError('UNAVAILABLE');
 const planner=snapshot.version==='deep-research-v2'?{...CONSENSUS_MODELS.candidates[2],apiKey:env.OPENROUTER_API_KEY!}:parsePlannerModel(env)!,answer=parseAnswerModel(env)!;
 if(snapshot.version==='deep-research-v2'&&JSON.stringify(snapshot.consensus.models)!==JSON.stringify(CONSENSUS_MODELS))throw new JobError('UNAVAILABLE');
 return {...(snapshot.version==='deep-research-v2'?{consensus:createConsensusProvider(snapshot.consensus.models,env.OPENROUTER_API_KEY!,request)}:{}),input:createLocalSafetyGuard(),query:createLocalSafetyGuard(),
  evidence:createLocalSafetyGuard(),output:createLocalSafetyGuard(),
  planner:createDeepPlanner(planner,request),answer:createAnswerProvider(answer,request,1200,45000),search:createTavilySearch(env.TAVILY_API_KEY!,request),extract:createTavilyExtract(env.TAVILY_API_KEY!,request)};
}
