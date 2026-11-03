import {afterAll,beforeAll,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import {billingCheckouts,jobPeriods} from '@/db/schema';
import {readUsage} from '@/server/billing/usage';
import {jobsFixture} from './jobs-fixture';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);afterAll(()=>f?.pg.close());
it('only shows Pro for the owner of a current, active LIVE paid period',async()=>{
 expect((await readUsage(f.db,f.subject)).subscription).toBeNull(); // TEST entitlement is not Pro.
 await f.db.insert(billingCheckouts).values({userId:f.owner,requestId:crypto.randomUUID(),planId:'plan_display',priceKey:'pro-live-monthly-inr-v1',environment:'LIVE',subscriptionId:'sub_display',state:'COMPLETED'});
 const [period]=await f.db.insert(jobPeriods).values({userId:f.owner,environment:'LIVE',subscriptionId:'sub_display',paymentId:'pay_display',invoiceId:'inv_display',startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+86400000),jobLimit:7,spentJobs:2,reservedJobs:1}).returning();
 expect((await readUsage(f.db,f.subject)).subscription).toMatchObject({plan:'PRO',reportsRemaining:4});
 await f.db.update(jobPeriods).set({state:'REVOKED'}).where(eq(jobPeriods.id,period.id));
 expect((await readUsage(f.db,f.subject)).subscription).toBeNull();
 await f.db.update(jobPeriods).set({state:'ACTIVE',endsAt:new Date(Date.now()-1)}).where(eq(jobPeriods.id,period.id));
 expect((await readUsage(f.db,f.subject)).subscription).toBeNull();
});
