import {z} from 'zod';
import {questionTextSchema,localeSchema} from '@/server/contracts/chat';
import {approvedPayloadSchema} from '@/server/contracts/answer';
import {searchQuerySchema} from '@/server/search/limits';
export const researchInput=z.strictObject({question:questionTextSchema.pipe(z.string().max(1000)),locale:localeSchema});
export const researchModels=z.strictObject({safety:z.strictObject({modelId:z.string().max(128),provider:z.string().max(64)}),
 planner:z.strictObject({modelId:z.string().max(128),provider:z.string().max(64)}),answer:z.strictObject({modelId:z.string().max(128),provider:z.string().max(64)})});
export const researchSnapshot=researchInput.extend({models:researchModels,policy:z.literal('v1'),version:z.literal('deep-research-v1')});
export type ResearchSnapshot=z.infer<typeof researchSnapshot>;
export const researchPlan=z.strictObject({queries:z.array(searchQuerySchema).length(3),focus:z.string().min(1).max(800)})
 .refine(p=>new Set(p.queries.map(q=>q.trim().toLowerCase())).size===3);
export const sectionNames=['Summary','Analysis','Limitations and conflicting evidence'] as const;
export const researchReport=z.strictObject({version:z.literal(1),question:researchInput.shape.question,createdAt:z.iso.datetime(),
 sections:z.array(z.strictObject({title:z.enum(sectionNames),answer:approvedPayloadSchema})).length(3)})
 .refine(r=>r.sections.every((s,i)=>s.title===sectionNames[i]&&s.answer.kind==='ANSWER'));
export type ResearchReport=z.infer<typeof researchReport>;
const step=(key:string,kind:'SYSTEM'|'MODEL'|'SEARCH',capMicroUsd:bigint)=>({key,kind,capMicroUsd});
const searchSteps=(start:number)=>Array.from({length:3},(_,i)=>[step(`query-${start+i}`,'MODEL',2250n),step(`search-${start+i}`,'SEARCH',15000n)]).flat();
export const deepResearch={version:'deep-research-v1',deadlineMs:900_000,leaseMs:30_000,steps:[
 step('input','MODEL',2250n),step('plan','MODEL',12000n),...searchSteps(1),step('initial-evidence','MODEL',2250n),
 step('refine','MODEL',12000n),...searchSteps(4),step('extract','SEARCH',15000n),step('evidence','MODEL',2250n),
 ...sectionNames.flatMap((_,i)=>[step(`draft-${i}`,'MODEL',14000n),step(`output-${i}`,'MODEL',2250n)]),step('publish','SYSTEM',0n),
]} as const;
