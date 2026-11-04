import {consensusModels} from './consensus-contracts';
// Catalog checked 2026-11-04. Runtime retains pinned routing, ZDR and price fences.
export const CONSENSUS_MODELS=consensusModels.parse({candidates:[
 {modelId:'google/gemini-3.8-flash',provider:'google-vertex/global'},
 {modelId:'qwen/qwen3.5-397b-a17b',provider:'venice'},
 {modelId:'deepseek/deepseek-v4.1-flash-1017',provider:'fireworks'},
],judge:{modelId:'openai/gpt-5.4-mini',provider:'azure'}});
export const consensusManifest={version:'deep-research-v2',deadlineMs:900000,leaseMs:30000,steps:[
 {key:'input',kind:'SYSTEM',capMicroUsd:0n},
 {key:'plan',kind:'MODEL',capMicroUsd:12000n},
 ...Array.from({length:3},(_,i)=>[{key:`query-${i+1}`,kind:'SYSTEM',capMicroUsd:0n},{key:`search-${i+1}`,kind:'SEARCH',capMicroUsd:15000n}]).flat(),
 {key:'initial-evidence',kind:'SYSTEM',capMicroUsd:0n},{key:'refine',kind:'MODEL',capMicroUsd:12000n},
 ...Array.from({length:3},(_,i)=>[{key:`query-${i+4}`,kind:'SYSTEM',capMicroUsd:0n},{key:`search-${i+4}`,kind:'SEARCH',capMicroUsd:15000n}]).flat(),
 {key:'extract',kind:'SEARCH',capMicroUsd:15000n},{key:'evidence',kind:'SYSTEM',capMicroUsd:0n},
 ...Array.from({length:3},(_,i)=>({key:`candidate-${i}`,kind:'MODEL',capMicroUsd:30000n})),
 {key:'judge',kind:'MODEL',capMicroUsd:60000n},
 ...Array.from({length:3},(_,i)=>({key:`output-${i}`,kind:'SYSTEM',capMicroUsd:0n})),
 {key:'report-safety',kind:'SYSTEM',capMicroUsd:0n},{key:'publish',kind:'SYSTEM',capMicroUsd:0n},
].map(s=>({...s,kind:s.kind as 'SYSTEM'|'MODEL'|'SEARCH'}))};
