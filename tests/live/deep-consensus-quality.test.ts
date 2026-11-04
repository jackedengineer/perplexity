import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {parse} from 'dotenv';
import {expect,it} from 'vitest';
import {createConsensusProvider,consensusEvidence} from '@/server/deep-research/consensus-provider';
import {CONSENSUS_MODELS} from '@/server/deep-research/consensus-models';
import {validateCandidate,validateJudgment} from '@/server/deep-research/consensus-contracts';
import {resolveResearchTime} from '@/server/deep-research/time';
import {buildEvidence} from '@/server/search/evidence';
import {providerUsage} from '@/server/ai/usage';
import {renderCitedDraft} from '@/server/ai/cited-draft';

// Explicit, separate from offline CI. Synthetic evidence contains no customer data.
// One adversarial judge call; no automatic paid retries or provider fallbacks.
it('rejects an incorrect two-model majority against the original evidence',async()=>{
 if(process.env.LIVE_DEEP_CONSENSUS!=='1')throw Error('Explicit paid opt-in required');
 const env=parse(readFileSync('.env.launch.local'));
 const metadata=async()=>{
  const response=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Key metadata unavailable');const {data}=await response.json();
  if(data.limit!==1||data.limit_reset!=='daily'||typeof data.limit_remaining!=='number'||data.limit_remaining<.06)throw Error('Approved daily cap and headroom required');
  return {limit:data.limit,reset:data.limit_reset,remaining:data.limit_remaining};
 };
 const before=await metadata(),observations:Array<Record<string,unknown>>=[];let calls=0,result='FAILED',heldMicroUsd=0n;
 const request:typeof fetch=async(url,init)=>{
  if(String(url)!=='https://openrouter.ai/api/v1/chat/completions'||++calls>1)throw Error('One-call envelope exhausted');
  heldMicroUsd=60000n;const start=performance.now(),response=await fetch(url,init);
  observations.push({status:response.status,ms:Math.round(performance.now()-start)});
  if(response.ok){const body=await response.clone().json(),usage=providerUsage(body.usage,body.model);if(usage.costMicroUsd!==null){heldMicroUsd=usage.costMicroUsd;observations.push({costMicroUsd:String(usage.costMicroUsd)});}}
  return response;
 };
 const evidence=consensusEvidence(buildEvidence(crypto.randomUUID(),[
  {title:'Synthetic City A audit',url:'https://example.org/audit',score:1,content:'The final audited 2024 report records 42 operating clinics in City A as of December 31, 2024. This supersedes the preliminary estimate of 45 clinics. The audit does not measure treatment quality.',published_date:'2025-02-01'},
  {title:'Synthetic City A estimate',url:'https://example.org/preliminary',score:.9,content:'The preliminary 2024 estimate lists 45 operating clinics in City A. This estimate is provisional and has not been audited.',published_date:'2024-11-01'},
 ],new Date()));
 const question='How many operating clinics did City A have in 2024? Explain conflicting figures and whether the count proves treatment quality.';
 const candidates=[0,1,2].map(i=>validateCandidate({claims:[{text:`The final audited count was ${i<2?45:42} clinics.`,support:[{sourceId:'S1',quote:'The final audited 2024 report records 42 operating clinics in City A as of December 31, 2024.'}]}],limitations:[]},evidence));
 try{
  const provider=createConsensusProvider(CONSENSUS_MODELS,env.OPENROUTER_API_KEY,request);
  const raw=await provider.judge({question,locale:'en',time:resolveResearchTime(question,new Date()),evidence},candidates,{signal:AbortSignal.timeout(95000),deadlineAt:new Date(Date.now()+95000)});
  const judged=validateJudgment(raw,candidates,evidence);
  expect(judged.judgments.filter(j=>j.claimId!=='C1').every(j=>j.verdict==='UNSUPPORTED')).toBe(true);
  expect(judged.judgments.find(j=>j.claimId==='C1')?.verdict).toBe('SUPPORTED');
  const markdown=judged.sections.map(section=>renderCitedDraft({paragraphs:section.map(p=>({text:p.text,sourceIds:[...new Set(p.claimIds.flatMap(id=>judged.judgments.find(j=>j.claimId===id)!.support.map(s=>s.sourceId)))]}))},evidence));
  expect(markdown[0]).toContain('42');expect(markdown.join(' ')).toMatch(/quality/i);result='PASSED';
 }finally{
  mkdirSync('.artifacts/consensus',{recursive:true});
  writeFileSync('.artifacts/consensus/quality-summary.json',JSON.stringify({result,before,after:await metadata(),calls,bookedMicroUsd:String(heldMicroUsd),observations},null,2),{mode:0o600});
 }
},100000);
