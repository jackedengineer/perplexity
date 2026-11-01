import {afterAll,afterEach,beforeAll,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import {jobsFixture} from './jobs-fixture';
import {models,providers} from './deep-fixture';
import {admitJob,readJob} from '@/server/jobs/admission';
import {claimJob,startStep,completeStep,recoverJobs,cancelJob} from '@/server/jobs/worker';
import {consumeResearch} from '@/server/deep-research/consumer';
import {durableJobs,operatorUsageBuckets,jobReservations} from '@/db/schema';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();await f.db.update(operatorUsageBuckets).set({providerLimitMicroUsd:1000000n});},30000);
afterAll(()=>f?.pg.close());
let activeId:string|undefined;
afterEach(async()=>{if(activeId)await cancelJob(f.db,f.subject,activeId);activeId=undefined;});
async function admitted(){return activeId=await admitJob(f.db,f.subject,{version:1,workflow:'deep-research-v1',requestId:crypto.randomUUID(),question:'Compare SQLite and PostgreSQL for offline applications.',locale:'en'},f.key,models);}
async function expire(id:string){await f.db.update(durableJobs).set({leaseUntil:new Date(Date.now()-1000)}).where(eq(durableJobs.id,id));await recoverJobs(f.db,20,f.key);}
it('never plans or searches after recovery of a previously committed input denial',async()=>{
 const id=await admitted(),lease=(await claimJob(f.db,id,f.key))!;
 await startStep(f.db,lease,'input');await completeStep(f.db,lease,'input',100n,{allowed:false});await expire(id);
 const p=providers();let invoked=0;p.planner.plan=async()=>{invoked++;throw new Error('Denied input must not be planned');};
 expect(await consumeResearch(f.db,id,{providers:p,budgetKey:f.key})).toBe('FAILED');expect(invoked).toBe(0);
 expect((await readJob(f.db,f.subject,id)).report).toBeUndefined();
});
it('never searches after recovery of a previously committed query denial',async()=>{
 const id=await admitted(),lease=(await claimJob(f.db,id,f.key))!;
 for(const [key,value] of [['input',{allowed:true}],['plan',{queries:['SQLite architecture','PostgreSQL architecture','SQLite PostgreSQL synchronization'],focus:'Compare databases'}],['query-1',{allowed:false}]] as const){await startStep(f.db,lease,key);await completeStep(f.db,lease,key,100n,value);}
 await expire(id);const p=providers();let invoked=0;p.search.search=async()=>{invoked++;throw new Error('Denied query must not be searched');};
 expect(await consumeResearch(f.db,id,{providers:p,budgetKey:f.key})).toBe('FAILED');expect(invoked).toBe(0);
});
it('atomically saves a stop receipt and terminal cost settlement',async()=>{
 const id=await admitted(),lease=(await claimJob(f.db,id,f.key))!;await startStep(f.db,lease,'input');
 await completeStep(f.db,lease,'input',100n,{allowed:false},true);
 expect((await readJob(f.db,f.subject,id)).state).toBe('FAILED');
 const [receipt]=await f.db.select().from(jobReservations).where(eq(jobReservations.jobId,id));expect(receipt.spentMicroUsd).toBe(100n);expect(receipt.heldMicroUsd).toBe(0n);expect(receipt.settledAt).not.toBeNull();
 expect(await consumeResearch(f.db,id,{providers:providers(),budgetKey:f.key})).toBe('DUPLICATE');
});
