import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {plannerInputSchema,validatePlan} from '@/server/ai/plan';
import {queryPlanSchema,type QueryPlan} from '@/server/contracts/pipeline';
import {rankEvidenceResults} from '@/server/search/rank';
export const PLANNING_CLOCK='2026-10-23T09:00:00.000Z';
export const planningCaseSchema=z.strictObject({id:z.string().regex(/^plan-\d{2}$/u),group:z.enum(['standalone','constraints','ambiguous','followup','false_premise']),original:plannerInputSchema.shape.original,context:plannerInputSchema.shape.context,expectedPlan:queryPlanSchema,humanReviewed:z.literal(false)});
export type PlanningCase=z.infer<typeof planningCaseSchema>;
export const planningInput=(c:PlanningCase)=>plannerInputSchema.parse({original:c.original,context:c.context,now:PLANNING_CLOCK,timezone:'UTC',locale:null});
export async function loadPlanningCorpus(){
 const text=await readFile('evals/cases/planning.jsonl','utf8'),cases=z.array(planningCaseSchema).length(30).parse(text.trim().split('\n').map(line=>JSON.parse(line)));
 if(new Set(cases.map(c=>c.id)).size!==cases.length)throw Error('Duplicate planning cases');
 for(const c of cases)validatePlan(c.expectedPlan,planningInput(c),2);
 return {cases,corpusHash:createHash('sha256').update(text).digest('hex')};
}
export function frozenPlanningEvidence(c:PlanningCase){
 const text=c.group==='followup'?c.context.at(-1)!.text.replace(/^Explain /u,'')+' pricing':c.expectedPlan.action==='ANSWER'?c.expectedPlan.standaloneQuestion:c.original.text;
 const selected={url:`https://example.org/${c.id}/selected`,title:text,content:`Authored evaluation fixture about ${text}. This is synthetic evidence, not real product pricing.`,score:.8};
 return c.group==='followup'?[{url:`https://example.org/${c.id}/other`,title:'OtherProduct pricing',content:'Authored evaluation fixture about OtherProduct pricing. This is synthetic evidence, not real product pricing.',score:.8},selected]:[selected];
}
export type PlanningObservation={id:string;plan:QueryPlan|null;latencyMs:number|null;costMicroUsd:string|null};
const latency=(values:number[])=>({samples:values.length,p50Ms:values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.5)-1]:null,p95Ms:values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]:null});
// Frozen source selection is a deterministic proxy, never an answer-quality or
// factual-support judgment. All authored labels still require human acceptance.
export function compareFrozenPlanning(cases:PlanningCase[],observations:PlanningObservation[],mode:'OFFLINE_EXPECTED_PLANS'|'LIVE_PROVIDER'){
 if(observations.length!==cases.length||new Set(observations.map(o=>o.id)).size!==cases.length||observations.some(o=>!cases.some(c=>c.id===o.id)))throw Error('Incomplete planning observations');
 let invalidPlans=0,routeMatches=0,unnecessaryClarifications=0,baselineRelevant=0,plannedRelevant=0,retrievalCases=0,available=0;
 const mismatches:string[]=[];
 for(const c of cases){
  const observed=observations.find(o=>o.id===c.id)!;let plan:QueryPlan|null=null;
  if(observed.plan){try{plan=validatePlan(observed.plan,planningInput(c),2);available++;}catch{invalidPlans++;}}
  if(plan?.action===c.expectedPlan.action)routeMatches++;else mismatches.push(c.id);
  if(plan?.action==='CLARIFY'&&c.expectedPlan.action==='ANSWER')unnecessaryClarifications++;
  if(c.expectedPlan.action==='ANSWER'){
   retrievalCases++;const rows=frozenPlanningEvidence(c),expected=`https://example.org/${c.id}/selected`;
   if(rankEvidenceResults(rows,c.original.text,new Date(PLANNING_CLOCK))[0]?.url===expected)baselineRelevant++;
   if(plan?.action==='ANSWER'&&rankEvidenceResults(rows,plan.standaloneQuestion,new Date(PLANNING_CLOCK))[0]?.url===expected)plannedRelevant++;
  }
 }
 const costs=observations.filter(o=>o.costMicroUsd!==null);
 return {mode,scope:'FROZEN_SOURCE_SELECTION_PROXY',authoredCases:cases.length,humanReviewedCases:0,humanQuality:'PENDING',releaseStatus:'PENDING',judge:null,
  availablePlans:available,invalidPlans,routeMatches,routeDenominator:cases.length,unnecessaryClarifications,mismatches,
  originalQuery:{relevantTop1:baselineRelevant,denominator:retrievalCases,plannerCalls:0,plannerLatencyMs:0,plannerCostMicroUsd:'0'},
  plannedQuery:{relevantTop1:plannedRelevant,denominator:retrievalCases,plannerCalls:observations.length,latency:latency(observations.flatMap(o=>o.latencyMs===null?[]:[o.latencyMs])),knownPlannerCostMicroUsd:costs.reduce((sum,o)=>sum+BigInt(o.costMicroUsd!),0n).toString(),unknownCostCases:observations.length-costs.length}};
}
