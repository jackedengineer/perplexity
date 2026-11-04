import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {jobsFixture} from './jobs-fixture';
import {models} from './deep-fixture';
import {consensusProviders} from './consensus-fixture';
import {admitJob,readJob} from '@/server/jobs/admission';
import {consumeResearch} from '@/server/deep-research/consumer';
import {loadResearch} from '@/server/deep-research/executor';
import {recoverJobs} from '@/server/jobs/worker';
import {operatorUsageBuckets,jobPeriods} from '@/db/schema';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();await f.db.update(operatorUsageBuckets).set({providerLimitMicroUsd:3000000n});},30000);
afterAll(()=>f?.pg.close());
const input=()=>({version:1,workflow:'deep-research-v2',question:'Which database is better for my project?',locale:'en',requestId:crypto.randomUUID()});
const clarify=()=>({action:'CLARIFY',brief:null,questions:[{id:'Q1',question:'Which databases and application are you comparing?',options:['SQLite and PostgreSQL for offline notes','MySQL and PostgreSQL for a web application']}],queries:[],focus:''});
async function waiting(question?:string){const id=await admitJob(f.db,f.subject,input(),f.key,models),p=consensusProviders();p.planner.plan=async()=>({value:{...clarify(),questions:[{...clarify().questions[0],...(question?{question}:{})}]},cost:100n});await consumeResearch(f.db,id,{providers:p});return id;}
it('atomically settles clarification without searching, publishing or consuming a report credit',async()=>{
 const id=await admitJob(f.db,f.subject,input(),f.key,models),p=consensusProviders();p.planner.plan=async()=>({value:clarify(),cost:100n});const search=vi.spyOn(p.search,'search'),judge=vi.spyOn(p.consensus,'judge');
 const before=(await f.db.select().from(jobPeriods))[0].spentJobs;
 expect(await consumeResearch(f.db,id,{providers:p})).toBe('NEEDS_INPUT');
 const job=await readJob(f.db,f.subject,id);expect(job.state).toBe('NEEDS_INPUT');expect(job.clarification?.questions).toHaveLength(1);expect(job.report).toBeUndefined();expect(job.spentMicroUsd).toBe('100');expect(job.heldMicroUsd).toBe('0');expect(search).not.toHaveBeenCalled();expect(judge).not.toHaveBeenCalled();
 expect((await f.db.select().from(jobPeriods))[0]).toMatchObject({spentJobs:before,reservedJobs:0});
 await recoverJobs(f.db);expect(await consumeResearch(f.db,id,{providers:p})).toBe('DUPLICATE');
});
it('keeps original question and owner-validated answers through rewriting, adjudication and publication',async()=>{
 const parent=await waiting('Do you require only official sources on sqlite.org?'),request={...input(),continuation:{jobId:parent,answers:[{id:'Q1',answer:'SQLite and PostgreSQL for offline notes'}]}};
 const id=await admitJob(f.db,f.subject,request,f.key,models);expect(await admitJob(f.db,f.subject,request,f.key,models)).toBe(id);
 const snapshot=await loadResearch(f.db,id);expect(snapshot.question).toBe(request.question);expect(snapshot).toMatchObject({clarificationRounds:1,clarifications:[{answer:'SQLite and PostgreSQL for offline notes'}]});
 const p=consensusProviders(),plan=vi.spyOn(p.planner,'plan'),judge=vi.spyOn(p.consensus,'judge'),search=vi.spyOn(p.search,'search');expect(await consumeResearch(f.db,id,{providers:p})).toBe('COMPLETED');
 expect(plan.mock.calls[0][0].snapshot).toMatchObject({clarifications:[{answer:request.continuation.answers[0].answer}]});expect(judge.mock.calls[0][0]).toMatchObject({clarifications:[{answer:request.continuation.answers[0].answer}]});
 expect((await readJob(f.db,f.subject,id)).report?.brief?.objective).toBeTruthy();
 expect(search.mock.calls[0][1]?.filters).toMatchObject({preferredDomains:[],domainMode:'prefer'});
});
it('rejects foreign, changed and malformed continuation contexts before reservation',async()=>{
 const parent=await waiting();const request={...input(),continuation:{jobId:parent,answers:[{id:'Q2',answer:'Anything'}]}};
 const before=await f.db.select().from(operatorUsageBuckets);
 await expect(admitJob(f.db,f.subject,request,f.key,models)).rejects.toThrow('INVALID_INPUT');
 await expect(admitJob(f.db,'different-owner',{...request,continuation:{jobId:parent,answers:[{id:'Q1',answer:'SQLite'}]}},f.key,models)).rejects.toThrow();
 await expect(admitJob(f.db,f.subject,{...request,question:'A different question',continuation:{jobId:parent,answers:[{id:'Q1',answer:'SQLite'}]}},f.key,models)).rejects.toThrow('INVALID_INPUT');
 expect(await f.db.select().from(operatorUsageBuckets)).toEqual(before);
});
it('bounds clarification rounds while preserving receipts and report credits',async()=>{
 let parent=await waiting();
 for(let round=1;round<=2;round++){
  const id=await admitJob(f.db,f.subject,{...input(),continuation:{jobId:parent,answers:[{id:'Q1',answer:'I am not sure yet'}]}},f.key,models),p=consensusProviders();p.planner.plan=async()=>({value:clarify(),cost:100n});
  expect(await consumeResearch(f.db,id,{providers:p})).toBe('NEEDS_INPUT');parent=id;
 }
 expect((await readJob(f.db,f.subject,parent)).clarification?.canContinue).toBe(false);
 await expect(admitJob(f.db,f.subject,{...input(),continuation:{jobId:parent,answers:[{id:'Q1',answer:'Still unsure'}]}},f.key,models)).rejects.toThrow('INVALID_INPUT');
});
