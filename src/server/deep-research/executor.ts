import {z} from 'zod';
import {eq} from 'drizzle-orm';
import {jobResearchInputs} from '@/db/schema';
import type {JobDatabase} from '@/server/jobs/store';
import {JobError} from '@/server/jobs/contracts';
import type {SafetyProvider} from '@/server/safety/provider';
import {createInputGate} from '@/server/safety/input';
import {createEvidenceGate} from '@/server/safety/evidence';
import {createReleaseGate} from '@/server/safety/release';
import {buildEvidence,safeEvidenceText,validateEvidence} from '@/server/search/evidence';
import {rankEvidenceResults,explicitPreferredDomains,type RankedResult} from '@/server/search/rank';
import {freshnessTimeRange} from '@/server/search/freshness';
import type {ExecutionOptions} from '@/server/ai/bounded';
import {approvedPayloadSchema} from '@/server/contracts/answer';
import {readCheckpoint} from './checkpoints';
import {researchSnapshot,researchPlan,researchReport,sectionNames,type ResearchSnapshot} from './contracts';
import {createDeepProviders,type DeepProviders} from './providers';
export type StepResult={value:unknown;cost:bigint;stop?:true};
const rowsSchema=z.array(z.object({title:z.string().max(2000),url:z.string().max(4096),content:z.string().max(16000),score:z.number().min(0).max(1),published_date:z.string().nullable().optional(),contentKind:z.enum(['SEARCH_PASSAGE','EXTRACTED_PAGE']).optional(),retrievedAt:z.string().optional()})).max(30);
export async function loadResearch(db:JobDatabase,id:string){
 const [row]=await db.select().from(jobResearchInputs).where(eq(jobResearchInputs.jobId,id));return researchSnapshot.parse(row?.snapshot);
}
export function researchExecutor(db:JobDatabase,id:string,snapshot:ResearchSnapshot,p:DeepProviders=createDeepProviders(snapshot)){
 const saved=(key:string)=>readCheckpoint(db,id,key);
 async function searches(count:number){return rowsSchema.parse((await Promise.all(Array.from({length:count},(_,i)=>saved(`search-${i+1}`)))).flatMap(v=>rowsSchema.parse(v)));}
 const preferences={freshness:freshnessTimeRange(snapshot.question)?'RECENT' as const:'ANY' as const,preferredDomains:explicitPreferredDomains(snapshot.question)};
 const rank=(rows:RankedResult[])=>rankEvidenceResults(rows,snapshot.question,new Date(),preferences,30);
 const evidence=async(key:string)=>{const value=validateEvidence(await saved(key));if(!value||!value.sources.length)throw new JobError('UNAVAILABLE');return value;};
 async function query(index:number){const plan=researchPlan.parse(await saved(index<=3?'plan':'refine'));return plan.queries[(index-1)%3];}
 const known=(value:unknown,cost:bigint|null|undefined,stop=false):StepResult=>{
  if(cost===null||cost===undefined||cost<0n)throw new JobError('UNAVAILABLE');return {value,cost,...(stop?{stop:true as const}:{})};
 };
 // All operations are private. The consumer persists only validated results and
 // receipts under its current lease, never raw responses or provider errors.
 return async function execute(key:string,options:ExecutionOptions):Promise<StepResult>{
  let receipt:(()=>bigint|null|undefined)|undefined;
  const tracked=(provider:SafetyProvider):SafetyProvider=>{let called=false;receipt=()=>called?provider.usage?.()?.costMicroUsd:0n;return {...provider,classify:async(input,signal)=>{called=true;return provider.classify(input,signal);}};};
  try{
   if(key==='input'||key.startsWith('query-')){
    const provider=tracked(key==='input'?p.input:p.query);
    const text=key==='input'?snapshot.question:await query(Number(key.slice(6)));
    const check=await createInputGate(provider,key==='input'?'safety.input':'safety.query').evaluate({text,context:key==='input'?[]:[{role:'USER',text:snapshot.question}]},options);
    return known({allowed:check.verdict.decision==='ALLOW'},check.modelId===null?0n:receipt?.(),check.verdict.decision!=='ALLOW');
   }
   if(key==='plan'||key==='refine'){
    receipt=()=>p.planner.usage?.()?.costMicroUsd;
    const previous=key==='refine'?researchPlan.parse(await saved('plan')).queries:[];
    const result=await p.planner.plan({snapshot,previous,...(key==='refine'?{evidence:await evidence('initial-evidence')}: {})},options);
    const plan=researchPlan.parse(result.value);
    if(plan.queries.some(q=>!safeEvidenceText(q)||previous.some(prior=>prior.trim().toLowerCase()===q.trim().toLowerCase()))||!safeEvidenceText(plan.focus))return known({unavailable:true},result.cost,true);
    return known(plan,result.cost);
   }
   if(key.startsWith('search-')){
    const results=await p.search.search(await query(Number(key.slice(7))),{...options,filters:{...preferences,timeRange:freshnessTimeRange(snapshot.question)??undefined,startDate:null,endDate:null}});
    return known(rowsSchema.parse(results.results),15000n);
   }
   if(key==='initial-evidence'||key==='evidence'){
    const data=key==='initial-evidence'?buildEvidence(id,rank(await searches(3)),new Date()):validateEvidence(await saved('extract'));
    if(!data?.sources.length)return known({unavailable:true},0n,true);
    const provider=tracked(p.evidence);
    const check=await createEvidenceGate(provider).evaluate(data,options);
    return known(check.verdict.decision==='ALLOW'?data:{unavailable:true},receipt?.(),check.verdict.decision!=='ALLOW');
   }
   if(key==='extract'){
    const rows=rank(await searches(6));if(!rows.length)return known(buildEvidence(id,[],new Date()),0n);
    const result=await p.extract.extract(rows.slice(0,2).map(r=>r.url),options);
    const combined=rows.map(row=>{const page=result.pages.find(p=>p.url===row.url);return page?{...row,content:page.content,contentKind:'EXTRACTED_PAGE' as const,retrievedAt:page.retrievedAt}:row;});
    return known(buildEvidence(id,rank(combined),new Date()),BigInt(result.credits)*15000n);
   }
   if(key.startsWith('draft-')){
    receipt=()=>p.answer.usage?.()?.costMicroUsd;
    const index=Number(key.slice(6)),selected=await evidence('evidence');
    const interpretation=snapshot.question+'\nWrite only this report section: '+sectionNames[index]+'. Use the supplied passages, identify disagreement and missing evidence explicitly, distinguish dates and estimates. Do not invent support or repeat other sections.';
    const result=await p.answer.generate({question:snapshot.question,interpretation,answerLanguage:snapshot.locale,evidence:selected},options);
    return known(z.string().min(1).max(4000).parse(result.text),result.usage.costMicroUsd);
   }
   if(key.startsWith('output-')){
    const provider=tracked(p.output);
    const result=await createReleaseGate(provider).approve({runId:id,attemptVersion:1,revision:1,kind:'ANSWER',question:snapshot.question,
     markdown:await saved(`draft-${Number(key.slice(7))}`),evidence:await evidence('evidence')},options);
    return known(result.kind==='APPROVED'?result.response:{unavailable:true},receipt?.(),result.kind!=='APPROVED');
   }
   if(key==='publish')return known(researchReport.parse({version:1,question:snapshot.question,createdAt:new Date().toISOString(),sections:await Promise.all(sectionNames.map(async(title,i)=>({title,answer:approvedPayloadSchema.parse(await saved(`output-${i}`))})))}),0n);
   throw new JobError('INVALID_INPUT');
  }catch{
   // A response can fail schema/safety checks after being billed. Preserve the
   // validated cost receipt; otherwise the terminal transition retains the cap.
   const cost=receipt?.();if(cost!==null&&cost!==undefined)return known({unavailable:true},cost,true);
   throw new JobError('UNAVAILABLE');
  }
 };
}
