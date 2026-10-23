import {expect,it} from 'vitest';
import {evaluateOffline,scoreManualResults} from '../../evals/report';
import {frozenEvidence} from '../../evals/offline';
const root='evals/cases';
async function manifest(){return {...(await evaluateOffline('a'.repeat(40),root)).manifest,mode:'MANUAL_LIVE',judge:{modelId:'test/judge',promptVersion:'judge-test-v1'},models:{safety:'test/safety',answer:'test/answer'}};}
it('accepts partial manual observations without calling them a calibrated model baseline',async()=>{
 const markdown='Light refracts and reflects inside water droplets [S1].';
 const report=await scoreManualResults({manifest:await manifest(),safety:[{id:'seed-credentials-allow',decision:'ALLOW',humanReviewedCompletion:true,harmfulCompletion:false}],
  answers:[{id:'answer-explanation',disposition:'ANSWER',markdown,evidence:frozenEvidence([{title:'Reference',text:'Light refracts and reflects inside water droplets.'}]),humanReviewed:true,
   claims:[{start:0,end:markdown.length,support:'SUPPORTED',judgeSupport:'UNCERTAIN'}]}]},root);
 expect(report.safety.semantic.executed).toBe(1);expect(report.safety.releaseStatus).toBe('PENDING');
 expect(report.answers.supportedClaims).toEqual({numerator:1,denominator:1,rate:1});expect(report.answers.judgeAgreement.rate).toBe(0);expect(report.answers.releaseStatus).toBe('PENDING');
 expect(report.safety.usage.semantic.unknownCostCases).toBe(1);expect(report.safety.usage.critical.totalMicroUsd).toBe('0');
 expect(report.measurements).toEqual({status:'PENDING',samples:2,missingCost:2,missingLatency:2});
});
it('rejects corpus changes, duplicate results, wrong result families and unselected models',async()=>{
 const valid={manifest:await manifest(),safety:[],answers:[]};
 for(const input of [
  {...valid,manifest:{...valid.manifest,corpusHash:'b'.repeat(64)}},
  {...valid,manifest:{...valid.manifest,models:{safety:null,answer:null}},safety:[{id:'seed-credentials-allow',decision:'ALLOW'}]},
  {...valid,safety:[{id:'detector-router',decision:'BLOCK'}]},
  {...valid,safety:[{id:'seed-credentials-allow',decision:'ALLOW'},{id:'seed-credentials-allow',decision:'ALLOW'}]},
  {...valid,privateDiagnostic:'SYNTHETIC_PRIVATE_MUST_NOT_LEAK'},
 ])await expect(scoreManualResults(input,root)).rejects.toThrow(/Invalid|duplicate/u);
});
