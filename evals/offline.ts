import {createInputGate} from '@/server/safety/input';
import {createEvidenceGate} from '@/server/safety/evidence';
import {createReleaseGate} from '@/server/safety/release';
import {buildEvidence} from '@/server/search/evidence';
import {validateCitations} from '@/server/ai/citations';
import type {SafetyProvider} from '@/server/safety/provider';
import type {SafetyCase,AnswerCase} from './contracts';
import type {SafetyObservation} from './score-safety';
const runId='11111111-1111-4111-8111-111111111111';
const frozenDate=new Date('2026-10-23T00:00:00.000Z');
export function frozenEvidence(passages:{title:string;text:string}[]){
 const evidence=buildEvidence(runId,passages.map((p,i)=>({title:p.title,url:`https://example.org/evals/${i+1}`,content:p.text,score:1-i*.1})),frozenDate);
 // Stable fixture identities allow exact observation-to-corpus binding on import.
 evidence.passages.forEach((p,i)=>{p.passageId=`22222222-2222-4222-8222-${String(i+1).padStart(12,'0')}`;});
 return evidence;
}
const sampleEvidence=()=>frozenEvidence([{title:'Frozen fixture',text:'Light refracts and reflects inside water droplets.'}]);
const allow={decision:'ALLOW',categoryCodes:[],policyVersion:'v1'};
// Construct invalid credential-shaped test data only in memory, so the corpus
// never contains a full provider-key signature that push protection must block.
const materialize=(text:string)=>text.replaceAll('[SYNTHETIC_OPENROUTER_KEY]',['sk','or','v1','a'.repeat(64)].join('-'));
function faultProvider(fault:string,onDispatch:()=>void):SafetyProvider|undefined {
 if(fault==='MISSING')return undefined;
 return {modelId:'test/safety',classify:async()=>{
  onDispatch();
  if(fault==='THROW')throw Error('SYNTHETIC_PRIVATE_SERVICE_FAILURE');
  if(fault==='MALFORMED')return {verdict:'ALLOW',privateDiagnostic:'SYNTHETIC_PRIVATE_SERVICE_FAILURE'};
  if(fault==='STALE')return {...allow,policyVersion:'v0'};
  if(fault==='CONTRADICTORY')return {...allow,categoryCodes:['FRAUD']};
  return allow;
 }};
}
export async function runOfflineSafety(cases:readonly SafetyCase[]):Promise<SafetyObservation[]> {
 const results:SafetyObservation[]=[];
 for(const c of cases){
  if(c.test==='SEMANTIC')continue;
  const text=materialize(c.text),context=c.context.map(turn=>({...turn,text:materialize(turn.text)}));
  const started=performance.now();let decision:SafetyObservation['decision'];
  if(c.test==='INPUT_DETECTOR'){
   // The unavailable double proves pass-through, never semantic permission.
   let dispatched=0;
   const provider={modelId:'test/safety',classify:async()=>{dispatched++;return {decision:'UNAVAILABLE',retryable:false,policyVersion:'v1'};}};
   const checked=await createInputGate(provider).evaluate({text,context},{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+5000)});
   if(checked.verdict.decision==='BLOCK'&&dispatched===0)decision='BLOCK';
   else if(checked.reason==='CLASSIFIER_UNAVAILABLE'&&dispatched===1)decision='ALLOW';
   else throw Error('Unexpected deterministic gate disposition');
  }else{
   const controller=new AbortController();
   if(c.test==='SERVICE_FAILURE'&&c.fault==='CANCELLED')controller.abort();
   const options={signal:controller.signal,deadlineAt:new Date(c.test==='SERVICE_FAILURE'&&c.fault==='EXPIRED'?0:Date.now()+5000)};
   let dispatched=0;
   const provider=c.test==='OUTPUT_CONTRACT'?{modelId:'test/safety',classify:async()=>{dispatched++;return allow;}}:faultProvider(c.fault,()=>{dispatched++;});
   if(c.stage==='OUTPUT'){
    const result=await createReleaseGate(provider).approve({runId,attemptVersion:1,revision:1,kind:'ANSWER',question:'Explain rainbows.',
     markdown:c.test==='OUTPUT_CONTRACT'?text:'Light refracts inside droplets [S1].',evidence:sampleEvidence()},options);
    decision=result.kind==='APPROVED'?'ALLOW':c.test==='OUTPUT_CONTRACT'||result.code==='OUTPUT_BLOCKED'?'BLOCK':'UNAVAILABLE';
    if(c.test==='OUTPUT_CONTRACT'&&dispatched)throw Error('Invalid output reached semantic provider');
   }else if(c.stage==='EVIDENCE'){
    decision=(await createEvidenceGate(provider).evaluate(sampleEvidence(),options)).verdict.decision;
   }else{
    decision=(await createInputGate(provider,c.stage==='INPUT'?'safety.input':'safety.query').evaluate({text,context},options)).verdict.decision;
   }
   if(c.test==='SERVICE_FAILURE'){
    const expectedDispatch=['MISSING','EXPIRED','CANCELLED'].includes(c.fault)?0:1;
    if(dispatched!==expectedDispatch)throw Error('Unexpected safety-service dispatch count');
   }
  }
  results.push({id:c.id,decision,elapsedMs:Math.round((performance.now()-started)*100)/100,costMicroUsd:'0'});
 }
 return results;
}
export function runFrozenCitationChecks(cases:readonly AnswerCase[]){
 return cases.map(c=>{
  let valid=false;
  try{validateCitations(c.referenceMarkdown,frozenEvidence(c.passages),c.kind==='ANSWER');valid=true;}catch{}
  return {id:c.id,valid,expected:c.expectedCitationValid};
 });
}
