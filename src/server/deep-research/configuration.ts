import {parseSafetyModel,parsePlannerModel,parseAnswerModel} from '@/server/ai/models';
import {researchModels} from './contracts';
import {JobError} from '@/server/jobs/contracts';
export function configuredResearchModels(env:Record<string,string|undefined>=process.env){
 const safety=parseSafetyModel(env),planner=parsePlannerModel(env),answer=parseAnswerModel(env);
 if(env.ENABLE_DEEP_RESEARCH!=='true'||!safety||!planner||!answer||!env.TAVILY_API_KEY||env.TAVILY_API_KEY==='disabled')throw new JobError('DISABLED');
 const publicConfig=({modelId,provider}:{modelId:string;provider:string})=>({modelId,provider});
 return researchModels.parse({safety:publicConfig(safety),planner:publicConfig(planner),answer:publicConfig(answer)});
}
