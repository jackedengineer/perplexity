import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {parse} from 'dotenv';
import {expect,it} from 'vitest';
import {parsePlannerModel,parseSafetyModel,parseAnswerModel} from '@/server/ai/models';
import {createPlannerProvider} from '@/server/ai/planner-provider';
import {createAnswerProvider} from '@/server/ai/answer';
import {boundedModelFetch} from '@/server/ai/bounded';
import {providerUsage} from '@/server/ai/usage';
import {PLANNING_VERSION,standaloneFallback} from '@/server/ai/plan';
import {createOpenRouterSafetyProvider} from '@/server/safety/openrouter';
import {createInputGate} from '@/server/safety/input';
import {createEvidenceGate,EVIDENCE_SAFETY_PROMPT} from '@/server/safety/evidence';
import {OUTPUT_SAFETY_PROMPT} from '@/server/safety/output';
import {createReleaseGate} from '@/server/safety/release';
import {buildEvidence} from '@/server/search/evidence';
import {rankEvidenceResults} from '@/server/search/rank';
import {loadPlanningCorpus,planningInput,frozenPlanningEvidence,compareFrozenPlanning,PLANNING_CLOCK,type PlanningObservation} from '../../evals/planning';
import {CURRENT_PROMPT_VERSIONS} from '../../evals/report';
import type {QueryPlan} from '@/server/contracts/pipeline';
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim();
it('evaluates the complete fixed planning corpus and paired frozen answers within the existing non-resetting $1 key cap',async()=>{
 if(process.env.LIVE_PLANNING_EVAL!=='1'||git('status','--porcelain'))throw Error('Clean committed candidate and explicit opt-in required');
 const revision=git('rev-parse','HEAD'),env=parse(await readFile('.env.launch.local','utf8'));
 const plannerConfig=parsePlannerModel(env),safetyConfig=parseSafetyModel(env),answerConfig=parseAnswerModel(env);
 if(!plannerConfig||!safetyConfig||!answerConfig)throw Error('Explicit evaluated model roles required');
 const metadata=async()=>{
  const response=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:`Bearer ${plannerConfig.apiKey}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('Key cap could not be verified');
  const {data}=await response.json();if(data.limit!==1||data.limit_reset!==null||typeof data.limit_remaining!=='number')throw Error('Existing $1 non-resetting key cap required');
  return {limit:data.limit,usage:data.usage,remaining:data.limit_remaining};
 };
 const before=await metadata();if(before.remaining<.25)throw Error('Insufficient headroom for the local $0.25 evaluation envelope');
 let activeFixtureId="",booked=0n,known=0n,unknown=0,calls=0;
 const wirePlans:Array<Record<string,unknown>>=[],guardResults:Array<Record<string,unknown>>=[];const cap=250000n,bounded=boundedModelFetch(fetch);
 const capped:typeof fetch=async(url,init)=>{
  const fixtureId=activeFixtureId,body=JSON.parse(String(init?.body)),reserve=body.model===answerConfig.modelId?12500n:2250n;
  if(++calls>180||booked+reserve>cap)throw Error('Local evaluation spending envelope exhausted');booked+=reserve;
  let receipt=false;
  try{
   const response=await bounded(url,init),envelope=JSON.parse(await response.clone().text()),usage=providerUsage(envelope.usage,envelope.model);
   if(usage.costMicroUsd!==null){booked+=usage.costMicroUsd-reserve;known+=usage.costMicroUsd;receipt=true;}
   try{const output=JSON.parse(envelope.choices?.[0]?.message?.content);if(output.plan)wirePlans.push({fixtureId,plan:output.plan});if(output.classification)guardResults.push({fixtureId,classification:output.classification});}catch{}
   return response;
  }finally{if(!receipt)unknown++;}
 };
 const planner=createPlannerProvider(plannerConfig,capped),answer=createAnswerProvider(answerConfig,capped);
 const inputGate=createInputGate(createOpenRouterSafetyProvider(safetyConfig,capped));
 const queryGate=createInputGate(createOpenRouterSafetyProvider(safetyConfig,capped),'safety.query');
 const evidenceGate=createEvidenceGate(createOpenRouterSafetyProvider(safetyConfig,capped,EVIDENCE_SAFETY_PROMPT));
 const release=createReleaseGate(createOpenRouterSafetyProvider(safetyConfig,capped,OUTPUT_SAFETY_PROMPT));
 const {cases,corpusHash}=await loadPlanningCorpus(),observations:PlanningObservation[]=[],packet:Array<Record<string,unknown>>=[];
 let directPlans=0,fallbackPlans=0,deterministicPlans=0,approvedClarifications=0,clarificationResponses=0,pairedApproved=0;
 const options=()=>({signal:AbortSignal.timeout(45000),deadlineAt:new Date(Date.now()+45000)});
 const directory=`.artifacts/planning-live/${revision.slice(0,8)}-${randomUUID()}`;await mkdir(directory,{recursive:true,mode:0o700});
 for(const fixture of cases){
  activeFixtureId=fixture.id;
  const input=planningInput(fixture),started=performance.now();let plan:QueryPlan|null=null,guarded=false;
  let plannerLatency:number|null=null,plannerCost:string|null=null;
  try{
   const checked=await inputGate.evaluate({text:input.original.text,context:input.context.map(({role,text})=>({role,text}))},options());
   if(checked.verdict.decision!=='ALLOW')throw Error('Input unavailable');
   const planStart=performance.now();
   try{const result=await planner.plan(input,options());plan=result.plan;directPlans++;if(result.engine==='CONTEXT_RULE')deterministicPlans++;}
   catch{plan=standaloneFallback(input);if(plan)fallbackPlans++;}
   finally{plannerLatency=Math.round(performance.now()-planStart);plannerCost=planner.usage?.()?.costMicroUsd?.toString()??null;}
   if(plan?.action==='ANSWER'){
    for(const query of plan.retrieval.queries){if((await queryGate.evaluate({text:query,context:[{role:'USER',text:input.original.text}]},options())).verdict.decision!=='ALLOW')throw Error('Query unavailable');}
    guarded=true;
   }else if(plan?.action==='CLARIFY'){
    const runId=randomUUID(),approved=await release.approve({runId,attemptVersion:1,revision:1,kind:'CLARIFICATION',question:input.original.text,markdown:plan.question,evidence:{runId,sources:[],passages:[]}},options());
    // Use one same-run registry, including for an empty clarification package.
    if(approved.kind==='APPROVED'){clarificationResponses++;if(fixture.expectedPlan.action==='CLARIFY')approvedClarifications++;}
   }
  }catch{/* Disposition and missing receipt remain visible, without upstream diagnostics. */}
  observations.push({id:fixture.id,plan,latencyMs:plannerLatency,costMicroUsd:plannerCost});
  const row:Record<string,unknown>={id:fixture.id,group:fixture.group,input,plan,guarded,durationMs:Math.round(performance.now()-started),answers:[]};
  if(guarded&&plan?.action==='ANSWER'&&['followup','false_premise'].includes(fixture.group)){
   const pairs:Array<Record<string,unknown>>=[];
   for(const mode of ['ORIGINAL','PLANNED'] as const){
    const runId=randomUUID(),question=input.original.text,interpretation=mode==='PLANNED'?plan.standaloneQuestion:undefined;
    let results=frozenPlanningEvidence(fixture);
    if(fixture.id==='plan-13')results=[{url:'https://example.org/orbits',title:'Authored orbital fixture',content:'Earth orbits the Sun. In the heliocentric description, the Sun does not orbit Earth.',score:.9}];
    if(fixture.id==='plan-14')results=[{url:'https://example.org/database-costs',title:'Authored database fixture',content:'Some database services offer free plans and paid plans. Not all database services are free.',score:.9}];
    const evidence=buildEvidence(runId,rankEvidenceResults(results,interpretation??question,new Date(PLANNING_CLOCK)),new Date(PLANNING_CLOCK)),began=performance.now();
    try{
     if((await evidenceGate.evaluate(evidence,options())).verdict.decision!=='ALLOW')throw Error('Evidence unavailable');
     const draft=await answer.generate({question,interpretation,evidence},options()),approved=await release.approve({runId,attemptVersion:1,revision:1,kind:'ANSWER',question,markdown:draft.text,evidence},options());
     if(approved.kind==='APPROVED'){pairedApproved++;pairs.push({mode,evidence,text:approved.response.markdown,status:'APPROVED',durationMs:Math.round(performance.now()-began)});}else pairs.push({mode,status:'WITHHELD'});
    }catch{pairs.push({mode,status:'UNAVAILABLE'});}
   }
   row.answers=pairs;
  }
  packet.push(row);await writeFile(`${directory}/wire-plans.json`,JSON.stringify(wirePlans,null,2),{mode:0o600});await writeFile(`${directory}/guard-results.json`,JSON.stringify(guardResults,null,2),{mode:0o600});await writeFile(`${directory}/review-packet.json`,JSON.stringify(packet,null,2),{mode:0o600});
 }
 const after=await metadata(),report={sourceRevision:revision,plannerVersion:PLANNING_VERSION,promptVersions:CURRENT_PROMPT_VERSIONS,corpusHash,models:{planner:plannerConfig.modelId,safety:safetyConfig.modelId,answer:answerConfig.modelId},keyCap:{before,after},localEnvelopeMicroUsd:String(cap),knownAllRoleMicroUsd:String(known),bookedIncludingUnknownMicroUsd:String(booked),unknownReceipts:unknown,providerRequests:calls,directPlans,deterministicPlans,fallbackPlans,clarificationResponses,approvedClarifications,clarificationDenominator:5,pairedApproved,pairedDenominator:14,...compareFrozenPlanning(cases,observations,'LIVE_PROVIDER')};
 await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2),{mode:0o600});
 console.info(JSON.stringify({event:'planning.live_complete',directory,routeMatches:report.routeMatches,directPlans,fallbackPlans,approvedClarifications,pairedApproved,calls,knownMicroUsd:String(known)}));
 expect(git('rev-parse','HEAD')).toBe(revision);expect(git('status','--porcelain')).toBe('');expect(booked).toBeLessThanOrEqual(cap);expect(after.limit).toBe(1);
 expect(report.routeMatches).toBe(30);expect(approvedClarifications).toBe(5);expect(pairedApproved).toBe(14);
});
