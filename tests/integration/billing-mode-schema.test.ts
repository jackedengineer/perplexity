import {afterAll,beforeAll,expect,it} from 'vitest';
import {jobsFixture} from './jobs-fixture';
import {billingCheckouts,billingInbox,billingReversals,jobPeriods} from '@/db/schema';
import {liveOffer,testOffer} from '@/server/payments/offer';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);
afterAll(()=>f?.pg.close());
it('keeps historical test grants and permits a separate live checkout for the same owner and request',async()=>{
 const [test]=await f.db.select().from(billingCheckouts);
 const [live]=await f.db.insert(billingCheckouts).values({...test,id:crypto.randomUUID(),environment:'LIVE',priceKey:liveOffer.priceKey,subscriptionId:'sub_liveschema'}).returning();
 expect(live.requestId).toBe(test.requestId);
 const [prior]=await f.db.select().from(jobPeriods);expect(prior).toMatchObject({environment:'TEST',jobLimit:10});
 await expect(f.db.insert(jobPeriods).values({userId:f.owner,environment:'LIVE',paymentId:'pay_wrongmode',invoiceId:'inv_wrongmode',subscriptionId:test.subscriptionId!,startsAt:prior.startsAt,endsAt:prior.endsAt,jobLimit:7})).rejects.toThrow();
 await expect(f.db.insert(jobPeriods).values({userId:f.owner,environment:'LIVE',paymentId:'pay_wronglimit',invoiceId:'inv_wronglimit',subscriptionId:live.subscriptionId!,startsAt:prior.startsAt,endsAt:prior.endsAt,jobLimit:10})).rejects.toThrow();
 const [period]=await f.db.insert(jobPeriods).values({userId:f.owner,environment:'LIVE',paymentId:'pay_liveschema',invoiceId:'inv_liveschema',subscriptionId:live.subscriptionId!,startsAt:prior.startsAt,endsAt:prior.endsAt,jobLimit:7}).returning();
 expect(period.jobLimit).toBe(7);
});
it('rejects relabeling offers or a period belonging to another owner',async()=>{
 const [prior]=await f.db.select().from(jobPeriods);
 for(const [environment,priceKey] of [['LIVE',testOffer.priceKey],['TEST',liveOffer.priceKey],['other',liveOffer.priceKey]]){
  await expect(f.db.insert(billingCheckouts).values({userId:f.owner,requestId:crypto.randomUUID(),planId:'plan_invalid',environment,priceKey,state:'UNKNOWN'})).rejects.toThrow();
 }
 await expect(f.db.insert(jobPeriods).values({userId:crypto.randomUUID(),environment:'TEST',paymentId:'pay_otherowner',invoiceId:'inv_otherowner',subscriptionId:prior.subscriptionId,startsAt:prior.startsAt,endsAt:prior.endsAt,jobLimit:10})).rejects.toThrow();
});
it('namespaces webhook identities and reversal tombstones by trusted server mode',async()=>{
 for(const environment of ['TEST','LIVE']){
  await f.db.insert(billingInbox).values({environment,eventId:'evt_shared',bodyHash:'a'.repeat(64),kind:'subscription.charged'});
  await f.db.insert(billingReversals).values({environment,paymentId:'pay_shared',reason:'payment.refunded'});
 }
 expect(await f.db.select().from(billingInbox)).toHaveLength(2);
 expect(await f.db.select().from(billingReversals)).toHaveLength(2);
 await expect(f.db.insert(billingInbox).values({environment:'LIVE',eventId:'evt_shared',bodyHash:'a'.repeat(64),kind:'subscription.charged'})).rejects.toThrow();
 await expect(f.db.insert(billingReversals).values({environment:'unknown',paymentId:'pay_invalid',reason:'payment.refunded'})).rejects.toThrow();
});
