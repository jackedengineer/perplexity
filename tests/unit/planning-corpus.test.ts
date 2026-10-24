import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {plannerInputSchema,validatePlan,standaloneFallback} from '@/server/ai/plan';
import {queryPlanSchema} from '@/server/contracts/pipeline';
import {z} from 'zod';
const fixture=z.strictObject({id:z.string(),group:z.enum(['constraints','standalone','ambiguous','followup','false_premise']),original:plannerInputSchema.shape.original,context:plannerInputSchema.shape.context,expectedPlan:queryPlanSchema,humanReviewed:z.literal(false)});
it('runs every authored planning case without representing synthetic labels as human acceptance',async()=>{
 const cases=(await readFile('evals/cases/planning.jsonl','utf8')).trim().split('\n').map(line=>fixture.parse(JSON.parse(line)));
 expect(cases).toHaveLength(30);expect(new Set(cases.map(c=>c.id)).size).toBe(30);
 const counts={standalone:0,constraints:0,ambiguous:0,followup:0,false_premise:0};
 for(const c of cases){
  counts[c.group]++;
  const input={original:c.original,context:c.context,now:'2026-10-23T09:00:00.000Z',timezone:'UTC',locale:null};
  expect(validatePlan(c.expectedPlan,input),c.id).toEqual(c.expectedPlan);
  if(c.group==='ambiguous')expect(standaloneFallback(input),c.id).toBeNull();
  if(c.expectedPlan.action==='ANSWER'){
   const plan=c.expectedPlan;
   // An extra topical constraint cannot be smuggled in by expanding the query.
   expect(()=>validatePlan({...plan,standaloneQuestion:plan.standaloneQuestion+' using Kubernetes'},input),c.id).toThrow();
  }
 }
 expect(counts).toEqual({standalone:12,constraints:6,ambiguous:5,followup:5,false_premise:2});
});

it('compares the same frozen evidence with and without interpretation and reports unreviewed quality honestly',async()=>{
 const {loadPlanningCorpus,compareFrozenPlanning}=await import('../../evals/planning');
 const {cases}=await loadPlanningCorpus(),report=compareFrozenPlanning(cases,cases.map(c=>({id:c.id,plan:c.expectedPlan,latencyMs:null,costMicroUsd:null})),'OFFLINE_EXPECTED_PLANS');
 expect(report).toMatchObject({routeMatches:30,invalidPlans:0,unnecessaryClarifications:0,originalQuery:{relevantTop1:20,denominator:25},plannedQuery:{relevantTop1:25,denominator:25},humanQuality:'PENDING',releaseStatus:'PENDING'});
 expect(()=>compareFrozenPlanning(cases,[],'LIVE_PROVIDER')).toThrow('Incomplete');
});
