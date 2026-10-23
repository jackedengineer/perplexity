import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {expect,it,vi} from 'vitest';
import * as release from '@/server/safety/release';
import {SAFETY_RESPONSES} from '@/server/safety/responses';
import {safetyCaseSchema,answerCaseSchema} from '../../evals/contracts';
import {runOfflineSafety,runFrozenCitationChecks} from '../../evals/offline';
it('executes every finite critical boundary case without semantic classifier calls',async()=>{
 const cases=(await readFile('evals/cases/safety.jsonl','utf8')).trim().split('\n').map(l=>safetyCaseSchema.parse(JSON.parse(l)));
 const rows=await runOfflineSafety(cases);
 expect(rows).toHaveLength(cases.filter(c=>c.critical).length);
 for(const row of rows){const c=cases.find(c=>c.id===row.id)!;expect(row.decision,c.id).toBe(c.expected);expect(row.costMicroUsd).toBe('0');}
});
it('runs real citation validation on frozen reference answers including invalid syntax',async()=>{
 const cases=(await readFile('evals/cases/answers.jsonl','utf8')).trim().split('\n').map(l=>answerCaseSchema.parse(JSON.parse(l)));
 const rows=runFrozenCitationChecks(cases);
 for(const row of rows)expect(row.valid,row.id).toBe(cases.find(c=>c.id===row.id)!.expectedCitationValid);
});
it('reports the offline baseline without inventing semantic or human quality scores',async()=>{
 const {evaluateOffline}=await import('../../evals/report');
 const report=await evaluateOffline('a'.repeat(40),'evals/cases');
 expect(report.safety.criticalStatus).toBe('PASS');expect(report.safety.pending).toBe(72);
 expect(report.frozenCitations).toEqual({numerator:24,denominator:24,rate:1});
 expect(report.safety.falseRefusals.rate).toBeNull();expect(report.answers.supportedClaims.rate).toBeNull();
 expect(report.safety.releaseStatus).toBe('PENDING');expect(report.answers.releaseStatus).toBe('PENDING');
 expect(report.criticalMismatches).toEqual([]);expect(report.citationMismatches).toEqual([]);
});
it('never calls fetch during offline boundary evaluation',async()=>{
 const {vi}=await import('vitest');
 const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('Network forbidden in offline evaluation'));
 try{
  const {evaluateOffline}=await import('../../evals/report');
  await evaluateOffline('a'.repeat(40),'evals/cases');expect(fetcher).not.toHaveBeenCalled();
 }finally{fetcher.mockRestore();}
});
it('does not relabel an incorrect output-service block as the expected outage',async()=>{
 const c=safetyCaseSchema.parse({id:'wrong-output',stage:'OUTPUT',test:'SERVICE_FAILURE',fault:'MISSING',critical:true,expected:'UNAVAILABLE',tag:'outage',locale:'en',policyVersion:'v1',labelSource:'SYNTHETIC_AUTHOR',text:'Explain rainbows.'});
 const stub=vi.spyOn(release,'createReleaseGate').mockReturnValue({approve:async()=>({kind:'DENIED',code:'OUTPUT_BLOCKED',response:SAFETY_RESPONSES.UNAVAILABLE})});
 try{expect(await runOfflineSafety([c])).toMatchObject([{decision:'BLOCK'}]);}finally{stub.mockRestore();}
});
it.each(['safety','citation'])('reports an explicit failure for a mismatched %s baseline',async family=>{
 await mkdir('.artifacts/evals',{recursive:true});const root=await mkdtemp('.artifacts/evals/corpus-');
 try{
  const safety=(await readFile('evals/cases/safety.jsonl','utf8')).trim().split('\n').map(l=>safetyCaseSchema.parse(JSON.parse(l)));
  const answers=(await readFile('evals/cases/answers.jsonl','utf8')).trim().split('\n').map(l=>answerCaseSchema.parse(JSON.parse(l)));
  if(family==='safety')safety.find(c=>c.test==='INPUT_DETECTOR'&&c.expected==='BLOCK')!.expected='ALLOW';
  else answers[0].expectedCitationValid=!answers[0].expectedCitationValid;
  await writeFile(root+'/safety.jsonl',safety.map(c=>JSON.stringify(c)).join('\n')+'\n');
  await writeFile(root+'/answers.jsonl',answers.map(c=>JSON.stringify(c)).join('\n')+'\n');
  const {evaluateOffline}=await import('../../evals/report');
  expect((await evaluateOffline('a'.repeat(40),root)).releaseStatus).toBe('FAIL');
 }finally{await rm(root,{recursive:true,force:true});}
});
