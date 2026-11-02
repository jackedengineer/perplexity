import {afterAll,beforeAll,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import {billingCheckouts,jobPeriods,operatorUsageBuckets} from '@/db/schema';
import {admitJob,readJob} from '@/server/jobs/admission';
import {cancelJob,claimJob,startStep} from '@/server/jobs/worker';
import {consumeResearch} from '@/server/deep-research/consumer';
import {models,providers} from './deep-fixture';
import {jobsFixture} from './jobs-fixture';

let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();f.key='live-fixture';await f.db.update(operatorUsageBuckets).set({budgetKey:f.key,providerLimitMicroUsd:1_000_000n});},30000);
afterAll(()=>f?.pg.close());
const input=()=>({version:1,workflow:'deep-research-v1',requestId:crypto.randomUUID(),question:'Compare SQLite and PostgreSQL for offline applications',locale:'en'});
const submit=()=>admitJob(f.db,f.subject,input(),f.key,models,'LIVE');
it('does not grant LIVE jobs from TEST receipts, then binds a real LIVE period',async()=>{
 await expect(submit()).rejects.toMatchObject({code:'PAYMENT_REQUIRED'});
 await f.db.insert(billingCheckouts).values({userId:f.owner,requestId:crypto.randomUUID(),planId:'plan_livejobs',priceKey:'pro-live-monthly-inr-v1',environment:'LIVE',subscriptionId:'sub_livejobs',state:'READY'});
 await f.db.insert(jobPeriods).values({userId:f.owner,environment:'LIVE',paymentId:'pay_livejobs',invoiceId:'inv_livejobs',subscriptionId:'sub_livejobs',startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+3600000),jobLimit:7});
 await expect(admitJob(f.db,f.subject,{version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()},f.key,undefined,'LIVE')).rejects.toMatchObject({code:'INVALID_INPUT'});
});
it('keeps report allowance on cancellation while retaining unknown provider exposure',async()=>{
 const id=await submit();
 await expect(claimJob(f.db,id,f.key,'TEST')).rejects.toMatchObject({code:'NOT_FOUND'});
 const lease=(await claimJob(f.db,id,f.key,'LIVE'))!;
 await startStep(f.db,lease,'input');await cancelJob(f.db,f.subject,id);await cancelJob(f.db,f.subject,id);
 const [period]=await f.db.select().from(jobPeriods).where(eq(jobPeriods.environment,'LIVE'));
 expect(period).toMatchObject({reservedJobs:0,spentJobs:0});
 expect(await readJob(f.db,f.subject,id)).toMatchObject({state:'CANCELLED',heldMicroUsd:'2250'});
 expect((await f.db.select().from(operatorUsageBuckets)).every(b=>b.reservedProviderMicroUsd===2250n)).toBe(true);
});
it('charges exactly one completed LIVE report and preserves the historical TEST allowance',async()=>{
 const id=await submit();expect(await consumeResearch(f.db,id,{budgetKey:f.key,environment:'LIVE',providers:providers()})).toBe('COMPLETED');
 expect(await consumeResearch(f.db,id,{budgetKey:f.key,environment:'LIVE',providers:providers()})).toBe('DUPLICATE');
 const periods=await f.db.select().from(jobPeriods);
 expect(periods.find(p=>p.environment==='LIVE')).toMatchObject({reservedJobs:0,spentJobs:1,jobLimit:7});
 expect(periods.find(p=>p.environment==='TEST')).toMatchObject({reservedJobs:0,spentJobs:0,jobLimit:10});
 expect((await readJob(f.db,f.subject,id)).report?.sections).toHaveLength(3);
});
