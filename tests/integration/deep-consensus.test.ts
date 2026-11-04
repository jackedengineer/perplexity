import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {jobsFixture} from './jobs-fixture';
import {models} from './deep-fixture';
import {consensusProviders} from './consensus-fixture';
import {admitJob,readJob} from '@/server/jobs/admission';
import {consumeResearch} from '@/server/deep-research/consumer';
import {loadResearch,researchExecutor} from '@/server/deep-research/executor';
import {claimJob,startStep,completeStep,recoverJobs,cancelJob} from '@/server/jobs/worker';
import {readCheckpoint} from '@/server/deep-research/checkpoints';
import {operatorUsageBuckets,durableJobs,jobPeriods} from '@/db/schema';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();await f.db.update(operatorUsageBuckets).set({providerLimitMicroUsd:3000000n});await f.db.update(jobPeriods).set({jobLimit:30});},30000);
afterAll(()=>f?.pg.close());
const input=()=>({version:1,workflow:'deep-research-v2',requestId:crypto.randomUUID(),question:'Compare SQLite and PostgreSQL for offline notes.',locale:'en'});
it('rejects an invalid date before reserving paid capacity',async()=>{
 const before=await f.db.select().from(operatorUsageBuckets);
 await expect(admitJob(f.db,f.subject,{...input(),question:'Compare databases from 2025-02-30 to 2025-03-01.'},f.key,models)).rejects.toThrow('INVALID_INPUT');
 expect(await f.db.select().from(operatorUsageBuckets)).toEqual(before);
});
it('reserves the entire ensemble and publishes only validated citations with immutable time',async()=>{
 const raw=input(),id=await admitJob(f.db,f.subject,raw,f.key,models),p=consensusProviders();
 const candidate=vi.spyOn(p.consensus,'candidate'),judge=vi.spyOn(p.consensus,'judge');
 expect(await admitJob(f.db,f.subject,raw,f.key,models)).toBe(id);
 const snapshot=await loadResearch(f.db,id);expect(snapshot.version).toBe('deep-research-v2');expect(snapshot.models.planner.modelId).toBe('deepseek/deepseek-v4.1-flash-1017');expect(snapshot.models.answer.modelId).toBe('openai/gpt-5.4-mini');
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('COMPLETED');
 expect(candidate).toHaveBeenCalledTimes(3);expect(judge).toHaveBeenCalledOnce();
 expect(candidate.mock.calls.map(c=>c[0])).toEqual([0,1,2]);
 expect(candidate.mock.calls.every(c=>!('candidates' in c[1]))).toBe(true);
 const job=await readJob(f.db,f.subject,id);expect(job.report?.sections).toHaveLength(3);expect(job.report?.consensus?.time.kind).toBe('EVERGREEN');
 expect(job.report?.sections.every(s=>s.answer.sources.length===1)).toBe(true);expect(job.spentMicroUsd).toBe('105600');expect(job.heldMicroUsd).toBe('0');
 expect(JSON.stringify(job)).not.toContain('judgments');expect(await consumeResearch(f.db,id,{providers:p})).toBe('DUPLICATE');
 await expect(readJob(f.db,'another-owner',id)).rejects.toThrow('NOT_FOUND');
});
it('rejects a fabricated quote before judging and retains the billed receipt',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=consensusProviders(),judge=vi.spyOn(p.consensus,'judge');
 p.consensus.candidate=async()=>({claims:[{text:'Unsupported',support:[{sourceId:'S1',quote:'This quote does not exist.'}]}],limitations:[]});
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('FAILED');expect(judge).not.toHaveBeenCalled();expect((await readJob(f.db,f.subject,id)).report).toBeUndefined();
 expect((await readJob(f.db,f.subject,id)).heldMicroUsd).toBe('0');
});
it('does not retry a lost paid response and keeps that full call reservation',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=consensusProviders();
 p.consensus.usage=()=>undefined;const call=vi.spyOn(p.consensus,'candidate').mockRejectedValue(Error('lost'));
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('FAILED');expect((await readJob(f.db,f.subject,id)).heldMicroUsd).toBe('30000');
 await recoverJobs(f.db);expect(await consumeResearch(f.db,id,{providers:p})).toBe('DUPLICATE');expect(call).toHaveBeenCalledOnce();
});
it('replays completed independent analyses after lease recovery without paying twice',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),snapshot=await loadResearch(f.db,id),p=consensusProviders();
 const {manifestFor}=await import('@/server/jobs/contracts'),execute=researchExecutor(f.db,id,snapshot,p),lease=(await claimJob(f.db,id))!;
 for(const step of manifestFor(snapshot.version).steps){
  await startStep(f.db,lease,step.key);const result=await execute(step.key,{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+60000)});
  expect(result.stop).toBeUndefined();await completeStep(f.db,lease,step.key,result.cost,result.value);if(step.key==='candidate-0')break;
 }
 const before=await readCheckpoint(f.db,id,'candidate-0');await f.db.update(durableJobs).set({leaseUntil:new Date(Date.now()-1000)}).where(eq(durableJobs.id,id));await recoverJobs(f.db);
 const candidate=vi.spyOn(p.consensus,'candidate');expect(await consumeResearch(f.db,id,{providers:p})).toBe('COMPLETED');expect(candidate.mock.calls.map(c=>c[0])).toEqual([1,2]);expect(await readCheckpoint(f.db,id,'candidate-0')).toEqual(before);
});
it('cancels between candidates without judging or publishing partial content',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=consensusProviders(),generate=p.consensus.candidate;
 p.consensus.candidate=async(...args)=>{const value=await generate(...args);await cancelJob(f.db,f.subject,id);return value;};
 const judge=vi.spyOn(p.consensus,'judge');await consumeResearch(f.db,id,{providers:p});expect(judge).not.toHaveBeenCalled();const job=await readJob(f.db,f.subject,id);expect(job.state).toBe('CANCELLED');expect(job.report).toBeUndefined();expect(job.heldMicroUsd).toBe('30000');
});
it('filters publication dates only on explicit publication requests',async()=>{
 for(const [question,expected] of [['Compare SQLite and PostgreSQL in 2024.','ANY'],['Compare SQLite and PostgreSQL articles published in 2024.','SPECIFIC_RANGE']]){
  const id=await admitJob(f.db,f.subject,{...input(),question},f.key,models),p=consensusProviders(),search=vi.spyOn(p.search,'search');
  expect(await consumeResearch(f.db,id,{providers:p})).toBe('COMPLETED');expect(search.mock.calls.every(c=>c[1].filters?.freshness===expected)).toBe(true);
 }
});
it('keeps same-day publication dates at the frozen admission instant',async()=>{
 const id=await admitJob(f.db,f.subject,{...input(),question:'Compare SQLite and PostgreSQL news today.'},f.key,models),snapshot=await loadResearch(f.db,id),p=consensusProviders();
 if(snapshot.version!=='deep-research-v2')throw Error('Expected v2');
 const publishedAt=new Date(Date.parse(snapshot.consensus.time.referenceAt!)-1000).toISOString(),search=p.search.search;
 p.search.search=async(...args)=>{const result=await search(...args);return {...result,results:result.results.map(r=>({...r,published_date:publishedAt}))};};
 const candidate=vi.spyOn(p.consensus,'candidate');
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('COMPLETED');
 expect(candidate.mock.calls[0][1].evidence.sources[0].publishedAt).toBe(publishedAt);
});
