import {expect,it} from 'vitest';
import {evaluateOffline,scoreManualResults} from '../../evals/report';
import {frozenEvidence} from '../../evals/offline';
const root='evals/cases',revision='a'.repeat(40);
async function manifest(){return {...(await evaluateOffline('a'.repeat(40),root)).manifest,mode:'MANUAL_LIVE',judge:{modelId:'test/judge',promptVersion:'judge-test-v1'},models:{safety:'test/safety',answer:'test/answer'}};}
it('accepts partial manual observations without calling them a calibrated model baseline',async()=>{
 const markdown='Light refracts and reflects inside water droplets [S1].';
 const report=await scoreManualResults({manifest:await manifest(),safety:[{id:'seed-credentials-allow',decision:'ALLOW',humanReviewedCompletion:true,harmfulCompletion:false}],
  answers:[{id:'answer-explanation',disposition:'ANSWER',markdown,evidence:frozenEvidence([{title:'Frozen reference 1',text:'Light refracts and reflects inside water droplets.'}]),humanReviewed:true,
   claims:[{start:0,end:markdown.length,support:'SUPPORTED',judgeSupport:'UNCERTAIN'}]}]},revision,root);
 expect(report.safety.semantic.executed).toBe(1);expect(report.safety.releaseStatus).toBe('PENDING');
 expect(report.answers.supportedClaims).toEqual({numerator:1,denominator:1,rate:1});expect(report.answers.judgeAgreement.rate).toBe(0);expect(report.answers.releaseStatus).toBe('PENDING');
 expect(report.safety.usage.semantic.unknownCostCases).toBe(1);expect(report.safety.usage.critical.totalMicroUsd).toBe('0');
 expect(report.measurements).toEqual({status:'PENDING',samples:2,missingCost:2,missingLatency:2});
});
it('rejects replaced evidence and edited source metadata for an otherwise valid cited answer',async()=>{
 const base={manifest:await manifest(),safety:[],answers:[] as unknown[]};
 const correct=frozenEvidence([{title:'Frozen reference 1',text:'Light refracts and reflects inside water droplets.'}]);
 const row={id:'answer-explanation',disposition:'ANSWER',markdown:'Light refracts inside droplets [S1].',evidence:correct,claims:[]};
 for(const evidence of [
  frozenEvidence([{title:'Frozen reference 1',text:'A different source makes a different claim.'}]),
  {...correct,sources:correct.sources.map(s=>({...s,url:'https://example.org/changed'}))},
  {...correct,sources:correct.sources.map(s=>({...s,title:'Edited title'}))},
 ])await expect(scoreManualResults({...base,answers:[{...row,evidence}]},revision)).rejects.toThrow('Invalid evaluation evidence');
 expect((await scoreManualResults({...base,answers:[row]},revision)).answers.executed).toBe(1);
});
it('rejects corpus changes, duplicate results, wrong result families and unselected models',async()=>{
 const valid={manifest:await manifest(),safety:[],answers:[]};
 for(const input of [
  {...valid,manifest:{...valid.manifest,corpusHash:'b'.repeat(64)}},
  {...valid,manifest:{...valid.manifest,models:{safety:null,answer:null}},safety:[{id:'seed-credentials-allow',decision:'ALLOW'}]},
  {...valid,safety:[{id:'detector-router',decision:'BLOCK'}]},
  {...valid,safety:[{id:'seed-credentials-allow',decision:'ALLOW'},{id:'seed-credentials-allow',decision:'ALLOW'}]},
  {...valid,privateDiagnostic:'SYNTHETIC_PRIVATE_MUST_NOT_LEAK'},
 ])await expect(scoreManualResults(input,revision,root)).rejects.toThrow(/Invalid|duplicate/u);
});
it('rejects stale source and prompt manifests even when the corpus is unchanged',async()=>{
 const valid={manifest:await manifest(),safety:[],answers:[]};
 for(const change of [{sourceRevision:'b'.repeat(40)},{promptVersions:{...valid.manifest.promptVersions,input:'input-v1'}},{promptVersions:{...valid.manifest.promptVersions,answer:'answer-v1'}}]){
  await expect(scoreManualResults({...valid,manifest:{...valid.manifest,...change}},revision,root)).rejects.toThrow('Invalid evaluation manifest');
 }
});
