import {AdmissionError} from '@/server/runs/errors';
import {parseAnswerModel,type SafetyModelConfig} from './models';
export const MODEL_CATALOG=[
 {key:'economy-nano',name:'GPT-4.1 nano',band:'ECONOMY',credits:2,modelId:'openai/gpt-4.1-nano',provider:'azure',maxOutputTokens:600},
 {key:'economy-mistral',name:'Mistral Small',band:'ECONOMY',credits:2,modelId:'mistralai/mistral-small-3.2-24b-instruct',provider:'deepinfra/fp8',maxOutputTokens:600},
 {key:'economy-qwen',name:'Qwen3 30B',band:'ECONOMY',credits:2,modelId:'qwen/qwen3-30b-a3b-instruct-2507',provider:'nebius/fp8',maxOutputTokens:600},
 {key:'economy-gemini',name:'Gemini 2.5 Flash Lite',band:'ECONOMY',credits:2,modelId:'google/gemini-2.5-flash-lite',provider:'google-ai-studio',maxOutputTokens:600},
 {key:'standard-deepseek',name:'DeepSeek V3',band:'STANDARD',credits:5,modelId:'deepseek/deepseek-chat-v3-0324',provider:'siliconflow/fp8',maxOutputTokens:1200},
 {key:'fast-default',name:'GPT-4.1 mini',band:'STANDARD',credits:5,modelId:'openai/gpt-4.1-mini',provider:'azure',maxOutputTokens:1200},
] as const;
export type ModelKey=typeof MODEL_CATALOG[number]['key'];
export function entitledModel(key:string,guest:boolean) {
 const entry=MODEL_CATALOG.find(m=>m.key===key);
 if(!entry||guest&&entry.band!=='ECONOMY')throw new AdmissionError('INVALID_INPUT');
 return entry;
}
export function catalogConfiguration(key:string,env:Record<string,string|undefined>):SafetyModelConfig|undefined {
 const entry=MODEL_CATALOG.find(m=>m.key===key);if(!entry)return undefined;
 // Explicit model/provider configuration must still match the curated entry.
 if(key==='fast-default'){const config=parseAnswerModel(env);return config?.modelId===entry.modelId&&config.provider===entry.provider?config:undefined;}
 if(!(env.ENABLED_ANSWER_MODELS??'').split(',').includes(key))return undefined;
 return parseAnswerModel({...env,MODEL_ANSWER:entry.modelId,ANSWER_OPENROUTER_PROVIDER:entry.provider});
}
