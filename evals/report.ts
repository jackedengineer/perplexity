import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {safetyCaseSchema,answerCaseSchema,safetyObservationSchema,manifestSchema} from './contracts';
import {parseJsonLines,prepareAnswerObservation} from './observations';
import {runOfflineSafety,runFrozenCitationChecks} from './offline';
import {scoreSafety} from './score-safety';
import {scoreAnswers} from './score-answers';
import {rate} from './shared';
// This module accepts no provider or credential configuration and performs no network work.
export async function loadCorpus(root='evals/cases'){
 const safetyText=await readFile(`${root}/safety.jsonl`,'utf8'),answerText=await readFile(`${root}/answers.jsonl`,'utf8');
 try{
  const safety=z.array(safetyCaseSchema).min(100).max(1000).parse(parseJsonLines(safetyText));
  const answers=z.array(answerCaseSchema).min(20).max(1000).parse(parseJsonLines(answerText));
  for(const rows of [safety,answers])if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error();
  const corpusHash=createHash('sha256').update('safety.jsonl\0').update(safetyText).update('\0answers.jsonl\0').update(answerText).digest('hex');
  const counts=(values:string[])=>Object.fromEntries([...new Set(values)].sort().map(key=>[key,values.filter(v=>v===key).length]));
  const profile={safetyByFamily:counts(safety.map(c=>c.test)),safetyByStage:counts(safety.map(c=>c.stage)),safetyByLocale:counts(safety.map(c=>c.locale)),answerScenarios:counts(answers.map(c=>c.scenario))};
  return {safety,answers,corpusHash,profile};
 }catch{throw Error('Invalid evaluation corpus; no contents logged');}
}
export async function evaluateOffline(sourceRevision:string,root?:string,sourceDirty=true){
 const corpus=await loadCorpus(root),safetyRows=await runOfflineSafety(corpus.safety),citations=runFrozenCitationChecks(corpus.answers);
 const safety=scoreSafety(corpus.safety,safetyRows),answers=scoreAnswers(corpus.answers.filter(c=>c.expectedCitationValid),[]);
 const manifest=manifestSchema.parse({schemaVersion:1,sourceRevision,sourceDirty,corpusHash:corpus.corpusHash,policyVersion:'v1',mode:'OFFLINE',judge:null,models:{safety:null,answer:null},promptVersions:{input:'input-v1',query:'input-v1',evidence:'evidence-v1',output:'output-v1',answer:'answer-v1',detector:'input-v1'}});
 return {manifest,profile:corpus.profile,safety,answers,frozenCitations:rate(citations.filter(r=>r.valid===r.expected).length,citations.length),
  criticalMismatches:safetyRows.filter(r=>r.decision!==corpus.safety.find(c=>c.id===r.id)!.expected).map(r=>r.id),
  citationMismatches:citations.filter(r=>r.valid!==r.expected).map(r=>r.id),
  scope:'DETERMINISTIC_AND_SERVICE_FAILURES_ONLY',paidTesting:'PENDING',humanQuality:'PENDING',releaseStatus:safety.criticalStatus==='FAIL'||citations.some(r=>r.valid!==r.expected)?'FAIL':'PENDING'};
}
export async function scoreManualResults(value:unknown,root?:string){
 const corpus=await loadCorpus(root);
 const parsed=z.strictObject({manifest:manifestSchema,safety:z.array(safetyObservationSchema).max(1000),answers:z.array(z.unknown()).max(1000)}).safeParse(value);
 if(!parsed.success||parsed.data.manifest.mode!=='MANUAL_LIVE'||parsed.data.safety.length>0&&parsed.data.manifest.models.safety===null||parsed.data.answers.length>0&&(parsed.data.manifest.models.answer===null||parsed.data.manifest.models.safety===null)||parsed.data.manifest.corpusHash!==corpus.corpusHash)throw Error('Invalid evaluation manifest; no contents logged');
 const input=parsed.data;
 const preparedAnswers=input.answers.map(prepareAnswerObservation);
 if(input.manifest.judge===null&&preparedAnswers.some(row=>row.claims.some(c=>c.judgeSupport!=null)))throw Error('Judge identity required for model annotations');
 if(input.safety.some(r=>!corpus.safety.some(c=>c.id===r.id&&c.test==='SEMANTIC')))throw Error('Invalid semantic evaluation case');
 const safety=scoreSafety(corpus.safety,[...await runOfflineSafety(corpus.safety),...input.safety]);
 const answers=scoreAnswers(corpus.answers.filter(c=>c.expectedCitationValid),preparedAnswers);
 const observed=[...input.safety,...preparedAnswers],missingCost=observed.filter(r=>r.costMicroUsd==null).length,missingLatency=observed.filter(r=>r.elapsedMs===undefined).length;
 const measurements={status:observed.length&&!missingCost&&!missingLatency?'RECORDED':'PENDING',samples:observed.length,missingCost,missingLatency};
 const releaseStatus=safety.releaseStatus==='FAIL'||answers.releaseStatus==='FAIL'?'FAIL':input.manifest.sourceDirty||measurements.status==='PENDING'||safety.releaseStatus==='PENDING'||answers.releaseStatus==='PENDING'?'PENDING':'PASS';
 return {manifest:input.manifest,safety,answers,releaseStatus,measurements,judgeCalibration:answers.judgeAgreement.denominator>=20?'RECORDED':'PENDING'};
}
