import {LOCAL_GUARD_MODEL} from '@/server/safety/local';
import {parsePlannerModel,parseAnswerModel} from '@/server/ai/models';
import {researchModels} from './contracts';
import {JobError} from '@/server/jobs/contracts';
export function configuredResearchModels(env:Record<string,string|undefined>=process.env){
 const planner=parsePlannerModel(env),answer=parseAnswerModel(env);
 if(env.ENABLE_DEEP_RESEARCH!=='true'||!planner||!answer||!env.TAVILY_API_KEY||env.TAVILY_API_KEY==='disabled')throw new JobError('DISABLED');
 const publicConfig=({modelId,provider}:{modelId:string;provider:string})=>({modelId,provider});
 return researchModels.parse({safety:LOCAL_GUARD_MODEL,planner:publicConfig(planner),answer:publicConfig(answer)});
}
