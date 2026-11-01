import {models,providers} from './deep-fixture';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {eq,sql} from 'drizzle-orm';
import {jobsFixture} from './jobs-fixture';
import {admitJob,readJob} from '@/server/jobs/admission';
import {claimJob,startStep,completeStep,recoverJobs,failJob} from '@/server/jobs/worker';
import {readCheckpoint} from '@/server/deep-research/checkpoints';
import {durableJobs,jobSteps,jobReservations,operatorUsageBuckets,jobResearchInputs,jobCheckpoints} from '@/db/schema';

let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();await f.db.update(operatorUsageBuckets).set({providerLimitMicroUsd:1000000n});},30000);
afterAll(()=>f?.pg.close());
const input=()=>({version:1,workflow:'deep-research-v1',requestId:crypto.randomUUID(),question:'Compare SQLite and PostgreSQL for offline applications.',locale:'en'});
it('requires explicit server configuration and rejects secrets before storage',async()=>{
 await expect(admitJob(f.db,f.subject,input(),f.key)).rejects.toThrow('DISABLED');
 const raw={...input(),question:'My key is sk-proj-'+ 'a'.repeat(50)};
 await expect(admitJob(f.db,f.subject,raw,f.key,models)).rejects.toThrow('REDACT_SECRET');
 expect(await f.db.select().from(jobResearchInputs)).toHaveLength(0);
});
it('snapshots private original, idempotency and all call reservations atomically',async()=>{
 const raw=input(),id=await admitJob(f.db,f.subject,raw,f.key,models);
 expect(await admitJob(f.db,f.subject,raw,f.key,models)).toBe(id);
 await expect(admitJob(f.db,f.subject,{...raw,question:'Another topic'},f.key,models)).rejects.toThrow('CONFLICT');
 expect((await readJob(f.db,f.subject,id)).question).toBe(raw.question);expect((await readJob(f.db,f.subject,id))).not.toHaveProperty('snapshot');
 expect((await f.db.select().from(jobResearchInputs))[0].snapshot.question).toBe(raw.question);
 expect((await f.db.select().from(jobReservations))[0].reservedMicroUsd).toBeGreaterThan(100000n);
 const lease=(await claimJob(f.db,id))!;await startStep(f.db,lease,'input');
 await completeStep(f.db,lease,'input',100n,{allowed:true});
 expect(await readCheckpoint(f.db,id,'input')).toEqual({allowed:true});
 await f.db.update(durableJobs).set({leaseUntil:new Date(Date.now()-1000)}).where(eq(durableJobs.id,id));
 await recoverJobs(f.db);const next=(await claimJob(f.db,id))!;
 expect(await startStep(f.db,next,'input')).toBe('DONE');
 expect(await readCheckpoint(f.db,id,'input')).toEqual({allowed:true});
 await expect(completeStep(f.db,lease,'input',100n,{changed:true})).rejects.toThrow('STALE');
 await startStep(f.db,next,'plan');await failJob(f.db,next);
 const view=await readJob(f.db,f.subject,id);expect(view.state).toBe('FAILED');expect(view.spentMicroUsd).toBe('100');expect(view.heldMicroUsd).toBe('12000');
 expect((await f.db.select().from(jobSteps).where(eq(jobSteps.key,'plan')))[0].state).toBe('UNKNOWN');
 expect((await f.db.select().from(operatorUsageBuckets)).every(b=>b.reservedProviderMicroUsd===12000n&&b.settledProviderMicroUsd===100n)).toBe(true);
});
it('detects checkpoint tampering instead of replaying corrupt evidence',async()=>{
 const [saved]=await f.db.select().from(jobCheckpoints);await f.db.update(jobCheckpoints).set({value:{tampered:true}}).where(eq(jobCheckpoints.jobId,saved.jobId));
 await expect(readCheckpoint(f.db,saved.jobId,saved.step)).rejects.toThrow('UNAVAILABLE');
 expect((await f.pg.query<{n:number}>('SELECT count(*)::int n FROM job_checkpoints')).rows[0].n).toBe(1);
 await f.db.execute(sql`SELECT 1`);
});

import {consumeResearch} from '@/server/deep-research/consumer';
it('completes six searches and releases only the atomically approved three-section report',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models);
 const p=providers();let calls=0;const search=p.search.search;p.search.search=async(...args)=>{calls++;return search(...args);};
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('COMPLETED');expect(calls).toBe(6);
 const job=await readJob(f.db,f.subject,id);expect(job.report?.sections).toHaveLength(3);expect(job.report?.sections[0].answer.sources[0].url).toBe('https://www.postgresql.org/docs/');
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('DUPLICATE');expect(calls).toBe(6);
 expect(job.spentMicroUsd).toBe('106800');expect(job.heldMicroUsd).toBe('0');
});
it('blocks unsafe queries before search and never returns a private draft',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=providers();let calls=0;
 p.query={...p.query,classify:async()=>({decision:'BLOCK',categoryCodes:['FRAUD'],policyVersion:'v1'})};
 p.search.search=async()=>{calls++;throw new Error('Must not search');};
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('FAILED');expect(calls).toBe(0);
 expect((await readJob(f.db,f.subject,id)).report).toBeUndefined();
});
it('retains unknown provider exposure and never retries the paid operation',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=providers();let calls=0;
 p.search.search=async()=>{calls++;throw new Error('Lost response');};
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('FAILED');
 expect((await readJob(f.db,f.subject,id)).heldMicroUsd).toBe('15000');
 await recoverJobs(f.db);expect(await consumeResearch(f.db,id,{providers:p})).toBe('DUPLICATE');expect(calls).toBe(1);
});
it('rejects output without valid citations and exposes no partial report',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=providers();p.answer.generate=async()=>({text:'Unsupported answer [S9]',usage:{costMicroUsd:100n,inputTokens:1,outputTokens:1,actualModel:'fixture'}});
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('FAILED');expect((await readJob(f.db,f.subject,id)).report).toBeUndefined();
});

it('checks cross-section interactions before publishing the assembled report',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=providers();const allow=p.output.classify;
 p.output={...p.output,classify:async(value,signal)=>value.text.includes('complete assembled')?{decision:'BLOCK',categoryCodes:['FRAUD'],policyVersion:'v1'}:allow(value,signal)};
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('FAILED');expect((await readJob(f.db,f.subject,id)).report).toBeUndefined();
 expect((await f.db.select().from(jobCheckpoints).where(eq(jobCheckpoints.jobId,id))).some(c=>c.step==='publish')).toBe(false);
});

import {researchExecutor,loadResearch} from '@/server/deep-research/executor';
import {cancelJob} from '@/server/jobs/worker';
it('does not reuse a prior provider receipt when a local prerequisite is missing',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=providers();let invoked=false;
 p.answer.usage=()=>({costMicroUsd:999n,inputTokens:1,outputTokens:1,actualModel:'fixture'});
 p.answer.generate=async()=>{invoked=true;throw new Error('Must not call');};
 const execute=researchExecutor(f.db,id,await loadResearch(f.db,id),p);
 const result=await execute('draft-0',{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+10000)});
 expect(result).toEqual({value:{unavailable:true},cost:0n,stop:true});expect(invoked).toBe(false);await cancelJob(f.db,f.subject,id);
});
it('keeps the returned receipt when a paid plan has an invalid shape',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=providers();p.planner.plan=async()=>({value:{invalid:true},cost:100n});
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('FAILED');const job=await readJob(f.db,f.subject,id);expect(job.spentMicroUsd).toBe('200');expect(job.heldMicroUsd).toBe('0');
});

it('shows the reviewed support template for distress without generating a report',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=providers();p.input={...p.input,classify:async()=>({decision:'BLOCK',categoryCodes:['SELF_HARM_DISTRESS'],policyVersion:'v1'})};
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('FAILED');const view=await readJob(f.db,f.subject,id);expect(view.notice).toContain('You deserve support');expect(view.report).toBeUndefined();
});

it('locally excludes secondary domains when official documentation was requested',async()=>{
 const id=await admitJob(f.db,f.subject,{...input(),question:'Compare SQLite and PostgreSQL using official documentation.'},f.key,models),p=providers();let drafted=false;
 p.search.search=async()=>({results:[{title:'Unofficial article',url:'https://example.org/article',content:'SQLite and PostgreSQL offline comparisons.',score:1}],credits:1});
 p.answer.generate=async()=>{drafted=true;throw new Error('No authoritative evidence');};
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('FAILED');expect(drafted).toBe(false);expect((await readJob(f.db,f.subject,id)).report).toBeUndefined();
});
