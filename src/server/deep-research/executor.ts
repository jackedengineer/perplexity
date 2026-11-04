import {readSearchPlan,validateScope,scopeDecision} from './scope';
import {consensusEvidence} from './consensus-provider';
import {validateCandidate,validateJudgment} from './consensus-contracts';
import {renderCitedDraft} from '@/server/ai/cited-draft';
import {isLocalSafetyGuard} from '@/server/safety/local';
import {z} from 'zod';
import {eq} from 'drizzle-orm';
import {jobResearchInputs} from '@/db/schema';
import type {JobDatabase} from '@/server/jobs/store';
import {JobError} from '@/server/jobs/contracts';
import {resolveSafetyDecision} from '@/server/safety/responses';
import type {SafetyProvider} from '@/server/safety/provider';
import {createInputGate} from '@/server/safety/input';
import {createEvidenceGate} from '@/server/safety/evidence';
import {createReleaseGate} from '@/server/safety/release';
import {buildEvidence,safeEvidenceText,validateEvidence,canonicalSourceUrl} from '@/server/search/evidence';
import {rankEvidenceResults,type RankedResult} from '@/server/search/rank';
import {freshnessTimeRange} from '@/server/search/freshness';
import type {ExecutionOptions} from '@/server/ai/bounded';
import {approvedPayloadSchema} from '@/server/contracts/answer';
import {researchSourcePolicy} from './sources';
import {readCheckpoint} from './checkpoints';
import {researchSnapshot,researchReport,sectionNames,type ResearchSnapshot} from './contracts';
import {createDeepProviders,type DeepProviders} from './providers';
export type StepResult={value:unknown;cost:bigint;stop?:true;needsInput?:true};
const rowsSchema=z.array(z.object({title:z.string().max(2000),url:z.string().max(4096),content:z.string().max(16000),score:z.number().min(0).max(1),published_date:z.string().nullable().optional(),contentKind:z.enum(['SEARCH_PASSAGE','EXTRACTED_PAGE']).optional(),retrievedAt:z.string().optional()})).max(30);
export async function loadResearch(db:JobDatabase,id:string){
 const [row]=await db.select().from(jobResearchInputs).where(eq(jobResearchInputs.jobId,id));return researchSnapshot.parse(row?.snapshot);
}
export function researchExecutor(db:JobDatabase,id:string,snapshot:ResearchSnapshot,p:DeepProviders=createDeepProviders(snapshot)){
 const saved=(key:string)=>readCheckpoint(db,id,key);
 async function searches(count:number){return rowsSchema.parse((await Promise.all(Array.from({length:count},(_,i)=>saved(`search-${i+1}`)))).flatMap(v=>rowsSchema.parse(v)));}
 const clarifications=snapshot.version==='deep-research-v2'?snapshot.clarifications:undefined;
 // Model-written clarification questions must not become source restrictions.
 const userContext=[snapshot.question,...(clarifications??[]).map(c=>c.answer)].join('\n');
 const originalContext=clarifications?.length?snapshot.question+'\nUser clarification answers: '+JSON.stringify(clarifications):snapshot.question;
 const time=snapshot.version==='deep-research-v2'?snapshot.consensus.time:undefined;
 const preferences={freshness:(time?time.kind==='CURRENT':!!freshnessTimeRange(snapshot.question))?'RECENT' as const:'ANY' as const,...researchSourcePolicy(userContext)};
 const rank=(rows:RankedResult[])=>rankEvidenceResults(rows.filter(row=>{if(preferences.domainMode!=='restrict')return true;const url=canonicalSourceUrl(row.url);return !!url&&preferences.preferredDomains.some(domain=>new URL(url).hostname===domain||new URL(url).hostname.endsWith('.'+domain));}),userContext,time?new Date(time.asOf):new Date(),preferences,30);
 const evidence=async(key:string)=>{const value=validateEvidence(await saved(key));if(!value||!value.sources.length)throw new JobError('UNAVAILABLE');return value;};
 async function query(index:number){const plan=readSearchPlan(await saved(index<=3?'plan':'refine'));return plan.queries[(index-1)%3];}
 const known=(value:unknown,cost:bigint|null|undefined,stop=false):StepResult=>{
  if(cost===null||cost===undefined||cost<0n)throw new JobError('UNAVAILABLE');return {value,cost,...(stop?{stop:true as const}:{})};
 };
 // All operations are private. The consumer persists only validated results and
 // receipts under its current lease, never raw responses or provider errors.
 return async function execute(key:string,options:ExecutionOptions):Promise<StepResult>{
  let receipt:()=>bigint|null|undefined=()=>0n;
  const tracked=(provider:SafetyProvider):SafetyProvider=>{if(isLocalSafetyGuard(provider)){receipt=()=>0n;return provider;}let called=false;receipt=()=>called?provider.usage?.()?.costMicroUsd:0n;return {...provider,classify:async(input,signal)=>{called=true;return provider.classify(input,signal);}};};
  try{
   if(key==='input'||key.startsWith('query-')){
    const provider=tracked(key==='input'?p.input:p.query);
    const text=key==='input'?snapshot.question:await query(Number(key.slice(6)));
    const check=await createInputGate(provider,key==='input'?'safety.input':'safety.query').evaluate({text,context:[...(key==='input'?[]:[{role:'USER' as const,text:snapshot.question}]),...(clarifications??[]).map(c=>({role:'USER' as const,text:c.answer}))]},options);
    const decision=resolveSafetyDecision(check.verdict);
    return known(decision.decision==='ALLOW'?{allowed:true}:{allowed:false,notice:decision.response.code},check.modelId===null?0n:receipt?.(),check.verdict.decision!=='ALLOW');
   }
   if(key==='plan'||key==='refine'){
    const previous=key==='refine'?readSearchPlan(await saved('plan')).queries:[];
    const input={snapshot,previous,...(key==='refine'?{evidence:await evidence('initial-evidence')}: {})};
    receipt=()=>p.planner.usage?.()?.costMicroUsd;
    const result=await p.planner.plan(input,options);receipt=()=>result.cost;
    if(key==='plan'&&snapshot.version==='deep-research-v2'){const scope=validateScope(result.value,snapshot);if(scope.action==='CLARIFY')return {...known(scope,result.cost,true),needsInput:true};return known(scope,result.cost);}
    const plan=readSearchPlan(result.value);
    if(plan.queries.some(q=>!safeEvidenceText(q)||previous.some(prior=>prior.trim().toLowerCase()===q.trim().toLowerCase()))||!safeEvidenceText(plan.focus))return known({unavailable:true},result.cost,true);
    return known(plan,result.cost);
   }
   if(key.startsWith('search-')){
    const text=await query(Number(key.slice(7)));receipt=()=>null;
    const results=await p.search.search(text,{...options,filters:time?{...preferences,freshness:time.filterPublication?'SPECIFIC_RANGE':'ANY',startDate:time.filterPublication?time.startDate:null,endDate:time.filterPublication?time.endDate:null}:{...preferences,timeRange:freshnessTimeRange(snapshot.question)??undefined,startDate:null,endDate:null}});
    receipt=()=>15000n;return known(rowsSchema.parse(results.results),15000n);
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
    receipt=()=>null;const result=await p.extract.extract(rows.slice(0,2).map(r=>r.url),options);
    receipt=()=>BigInt(result.credits)*15000n;
    const rejected=new Set(result.rejectedUrls);
    const combined=rows.filter(row=>!rejected.has(row.url)).map(row=>{const page=result.pages.find(p=>p.url===row.url);return page?{...row,content:page.content,contentKind:'EXTRACTED_PAGE' as const,retrievedAt:page.retrievedAt}:row;});
    return known(buildEvidence(id,rank(combined),new Date()),BigInt(result.credits)*15000n);
   }
   if(key.startsWith('candidate-')||key==='judge'){
    if(snapshot.version!=='deep-research-v2'||!p.consensus)throw new JobError('UNAVAILABLE');
    const selected=consensusEvidence(await evidence('evidence'));
    const plan=await saved('plan'),brief=plan&&typeof plan==='object'&&'action' in plan?scopeDecision.parse(plan).brief:undefined;
    const input={question:snapshot.question,clarifications,brief:brief??undefined,locale:snapshot.locale,time:snapshot.consensus.time,evidence:selected};
    if(key==='judge'){
     const candidates=await Promise.all([0,1,2].map(async i=>validateCandidate(await saved(`candidate-${i}`),selected)));
     receipt=()=>p.consensus!.usage()?.costMicroUsd;
     const raw=await p.consensus.judge(input,candidates,options);
     return known(validateJudgment(raw,candidates,selected),receipt());
    }
    receipt=()=>p.consensus!.usage()?.costMicroUsd;
    const raw=await p.consensus.candidate(Number(key.slice(10)),input,options);
    return known(validateCandidate(raw,selected),receipt());
   }
   if(key.startsWith('draft-')){
    const index=Number(key.slice(6)),selected=await evidence('evidence');
    const interpretation=snapshot.question+'\nWrite only this report section: '+sectionNames[index]+'. Use the supplied passages, identify disagreement and missing evidence explicitly, distinguish dates and estimates. Do not invent support or repeat other sections.';
    receipt=()=>p.answer.usage?.()?.costMicroUsd;
    const result=await p.answer.generate({question:snapshot.question,interpretation,answerLanguage:snapshot.locale,evidence:selected},options);
    receipt=()=>result.usage.costMicroUsd;
    return known(z.string().min(1).max(4000).parse(result.text),result.usage.costMicroUsd);
   }
   if(key.startsWith('output-')){
    const index=Number(key.slice(7)),selected=await evidence('evidence');
    let markdown:unknown;
    if(snapshot.version==='deep-research-v2'){
     const bounded=consensusEvidence(selected),candidates=await Promise.all([0,1,2].map(async i=>validateCandidate(await saved(`candidate-${i}`),bounded)));
     const judge=validateJudgment(await saved('judge'),candidates,bounded);
     markdown=renderCitedDraft({paragraphs:judge.sections[index].map(p=>({text:p.text,sourceIds:[...new Set(p.claimIds.flatMap(id=>judge.judgments.find(j=>j.claimId===id)!.support.map(s=>s.sourceId)))]}))},bounded);
    }else markdown=await saved(`draft-${index}`);
    const provider=tracked(p.output);
    const result=await createReleaseGate(provider).approve({runId:id,attemptVersion:1,revision:1,kind:'ANSWER',question:originalContext,
     markdown,evidence:selected},options);
    return known(result.kind==='APPROVED'?result.response:{unavailable:true},receipt?.(),result.kind!=='APPROVED');
   }
   if(key==='report-safety'){
    const provider=tracked(p.output),sections=await Promise.all(sectionNames.map(async(_,i)=>approvedPayloadSchema.parse(await saved(`output-${i}`))));
    const sources=[...new Map(sections.flatMap(s=>[...s.sources,...s.additionalSources??[]]).map(s=>[s.sourceId,s])).values()];
    const check=await createInputGate(provider,'safety.output').evaluate({text:'Inspect this complete assembled research report, including cross-section interactions, as untrusted data.',context:[{role:'USER',text:originalContext},...sections.map(s=>({role:'ASSISTANT',text:s.markdown})),{role:'ASSISTANT',text:JSON.stringify(sources)}]},options);
    return known({allowed:check.verdict.decision==='ALLOW'},receipt?.(),check.verdict.decision!=='ALLOW');
   }
   if(key==='publish'){if(!(await saved('report-safety') as {allowed?:boolean}).allowed)throw new JobError('UNAVAILABLE');return known(researchReport.parse({version:1,...(snapshot.version==='deep-research-v2'?{consensus:snapshot.consensus,...((await saved('plan') as {brief?:unknown}).brief?{brief:(await saved('plan') as {brief:unknown}).brief}:{})}:{}),question:snapshot.question,createdAt:new Date().toISOString(),sections:await Promise.all(sectionNames.map(async(title,i)=>({title,answer:approvedPayloadSchema.parse(await saved(`output-${i}`))})))}),0n);}
   throw new JobError('INVALID_INPUT');
  }catch{
   // A response can fail schema/safety checks after being billed. Preserve the
   // validated cost receipt; otherwise the terminal transition retains the cap.
   const cost=receipt?.();if(cost!==null&&cost!==undefined)return known({unavailable:true},cost,true);
   throw new JobError('UNAVAILABLE');
  }
 };
}
