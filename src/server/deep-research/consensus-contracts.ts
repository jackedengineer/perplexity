import {z} from 'zod';
import {researchTime} from './time';
import type {EvidencePackage} from '@/server/contracts/pipeline';
const model=z.strictObject({modelId:z.string().max(128),provider:z.string().max(64)});
export const consensusModels=z.strictObject({candidates:z.tuple([model,model,model]),judge:model}).superRefine((v,c)=>{
 if(new Set(v.candidates.map(m=>m.modelId.split('/')[0])).size!==3||new Set(v.candidates.map(m=>m.provider.split('/')[0])).size!==3||v.candidates.some(m=>m.modelId===v.judge.modelId))c.addIssue({code:'custom',message:'Independent models and providers required'});
});
export const consensusMetadata=z.strictObject({models:consensusModels,time:researchTime});
const sourceId=z.string().regex(/^S(?:[1-9]|10)$/u);
const support=z.strictObject({sourceId,quote:z.string().min(12).max(240)});
export const candidateAnalysis=z.strictObject({claims:z.array(z.strictObject({text:z.string().min(1).max(500),support:z.array(support).min(1).max(2)})).min(1).max(4),limitations:z.array(z.string().min(1).max(300)).max(3)});
export type CandidateAnalysis=z.infer<typeof candidateAnalysis>;
export const judgedReport=z.strictObject({
 judgments:z.array(z.strictObject({claimId:z.string().regex(/^[ABC][1-4]$/u),verdict:z.enum(['SUPPORTED','CONFLICTING','UNSUPPORTED']),reason:z.string().min(1).max(300),support:z.array(support).max(2)})).min(3).max(12),
 sections:z.array(z.array(z.strictObject({text:z.string().min(1).max(1000),claimIds:z.array(z.string().regex(/^[ABC][1-4]$/u)).min(1).max(4)})).min(1).max(3)).length(3),
});
export type JudgedReport=z.infer<typeof judgedReport>;
const normalize=(s:string)=>s.replace(/\s+/gu,' ').trim();
export function verifySupport(items:Array<z.infer<typeof support>>,evidence:EvidencePackage){
 for(const item of items)if(normalize(item.quote).length<12||!evidence.sources.some(s=>s.sourceId===item.sourceId)||!evidence.passages.some(p=>p.sourceId===item.sourceId&&normalize(p.text).includes(normalize(item.quote))))throw Error('Evidence quote does not match');
}
export function validateCandidate(raw:unknown,evidence:EvidencePackage){const value=candidateAnalysis.parse(raw);for(const claim of value.claims)verifySupport(claim.support,evidence);return value;}
export function validateJudgment(raw:unknown,candidates:CandidateAnalysis[],evidence:EvidencePackage){
 const value=judgedReport.parse(raw),ids=candidates.flatMap((c,i)=>c.claims.map((_,j)=>String.fromCharCode(65+i)+(j+1)));
 if(candidates.length!==3||value.judgments.length!==ids.length||new Set(value.judgments.map(j=>j.claimId)).size!==ids.length||value.judgments.some(j=>!ids.includes(j.claimId)))throw Error('Incomplete adjudication');
 for(const j of value.judgments){verifySupport(j.support,evidence);if(j.verdict!=='UNSUPPORTED'&&!j.support.length)throw Error('Missing support');}
 for(const [index,section] of value.sections.entries())for(const p of section){
  if(new Set(p.claimIds).size!==p.claimIds.length)throw Error('Duplicate claim');
  for(const id of p.claimIds){const j=value.judgments.find(j=>j.claimId===id);if(!j||j.verdict==='UNSUPPORTED'||index<2&&j.verdict!=='SUPPORTED')throw Error('Unsubstantiated final claim');}
  if(new Set(p.claimIds.flatMap(id=>value.judgments.find(j=>j.claimId===id)!.support.map(s=>s.sourceId))).size>3)throw Error('Too many paragraph sources');
 }
 return value;
}
