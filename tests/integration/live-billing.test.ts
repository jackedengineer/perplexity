import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createHmac} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import {billingCheckouts,billingInbox,jobPeriods} from '@/db/schema';
import {billingStatus,cancelSubscription,confirmCheckout,ingestWebhook,processBillingInbox,reconcileCheckout,startCheckout} from '@/server/payments/billing';
import {reconcileDueCheckouts} from '@/server/payments/maintenance';
import {liveOffer,testOffer} from '@/server/payments/offer';
import type {RazorpayApi} from '@/server/payments/razorpay';
import {jobsFixture} from './jobs-fixture';

let f:Awaited<ReturnType<typeof jobsFixture>>,checkoutId='';
const secret='synthetic-live-key-secret-for-tests',webhook='synthetic-live-webhook-secret-for-tests';
const now=Math.floor(Date.now()/1000),subscription=()=>({id:'sub_liveflow',plan_id:'plan_liveflow',status:'active' as const,quantity:1 as const,notes:{checkoutId,priceKey:liveOffer.priceKey}});
const invoice={id:'inv_liveflow',payment_id:'pay_liveflow',status:'paid',amount:99900,amount_paid:99900,currency:'INR',billing_start:now-10,billing_end:now+2592000};
const payment={id:invoice.payment_id,invoice_id:invoice.id,status:'captured',amount:99900,currency:'INR',amount_refunded:0};
const create=vi.fn(async(id:string)=>{checkoutId=id;return subscription();});
const cancel=vi.fn(async()=>({...subscription(),status:'cancelled' as const}));
const api:RazorpayApi={keyId:'rzp_live_fixture',plan:async()=>({id:'plan_liveflow',period:'monthly',interval:1,item:{amount:99900,currency:'INR'}}),
 create,subscription:async()=>subscription(),subscriptions:async()=>[subscription()],invoices:async()=>[invoice],payment:async()=>payment,cancel};
beforeAll(async()=>{f=await jobsFixture();},30000);
afterAll(()=>f?.pg.close());
const grant=async()=>{
 const raw={checkoutId,razorpay_subscription_id:'sub_liveflow',razorpay_payment_id:invoice.payment_id,
  razorpay_signature:createHmac('sha256',secret).update(invoice.payment_id+'|sub_liveflow').digest('hex')};
 await confirmCheckout(f.db,f.subject,raw,secret,api);
};
const periods=()=>f.db.select().from(jobPeriods).where(eq(jobPeriods.environment,'LIVE'));

it('rejects caller-selected test price before provider IO and persists one separate live intent',async()=>{
 const plan=vi.fn(api.plan),request={requestId:crypto.randomUUID(),priceKey:liveOffer.priceKey};
 await expect(startCheckout(f.db,f.subject,{...request,priceKey:testOffer.priceKey},'plan_liveflow',{...api,plan})).rejects.toMatchObject({code:'INVALID_INPUT'});
 expect(plan).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
 const result=await startCheckout(f.db,f.subject,request,'plan_liveflow',api);
 expect(result).toMatchObject({mode:'LIVE',priceKey:liveOffer.priceKey,state:'READY'});
 expect(await startCheckout(f.db,f.subject,request,'plan_liveflow',api)).toEqual(result);
 expect(create).toHaveBeenCalledTimes(1);expect(await periods()).toHaveLength(0);
});
it('grants seven only after linked captured payment and never changes the historical test grant',async()=>{
 await grant();await grant();
 expect(await periods()).toHaveLength(1);expect((await periods())[0]).toMatchObject({environment:'LIVE',jobLimit:7,spentJobs:0});
 const test=await f.db.select().from(jobPeriods).where(eq(jobPeriods.environment,'TEST'));
 expect(test[0].jobLimit).toBe(10);
 const liveStatus=await billingStatus(f.db,f.subject,'LIVE'),testStatus=await billingStatus(f.db,f.subject,'TEST');
 expect(liveStatus).toMatchObject({mode:'LIVE',priceKey:liveOffer.priceKey,jobLimit:7,access:{remaining:7}});
 expect(testStatus).toMatchObject({mode:'TEST',jobLimit:10,access:{remaining:10}});
 expect(liveStatus.checkouts).toHaveLength(1);expect(testStatus.checkouts).toHaveLength(1);
});
it('rejects cross-mode confirmation, cancellation and recovery before provider effects',async()=>{
 const wrongApi={...api,keyId:'rzp_test_fixture',subscription:vi.fn(api.subscription)};
 await expect(cancelSubscription(f.db,f.subject,checkoutId,wrongApi)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(reconcileCheckout(f.db,checkoutId,wrongApi)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(cancelSubscription(f.db,'another-owner',checkoutId,api)).rejects.toMatchObject({code:'NOT_FOUND'});
 expect(wrongApi.subscription).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();
});
it('isolates inbox claims and test reversals, then keeps live paid-through on renewal cancellation',async()=>{
 const bytes=Buffer.from(JSON.stringify({event:'payment.refunded',payload:{payment:{entity:{id:invoice.payment_id}}}}));
 const signature=createHmac('sha256',webhook).update(bytes).digest('hex');
 await ingestWebhook(f.db,'evt_modeflow',bytes,signature,webhook,'TEST');
 expect((await periods())[0].state).toBe('ACTIVE');
 expect(await processBillingInbox(f.db,api)).toBe(0);
 expect((await f.db.select().from(billingInbox))[0]).toMatchObject({environment:'TEST',state:'PENDING',attempts:0});
 await cancelSubscription(f.db,f.subject,checkoutId,api);await cancelSubscription(f.db,f.subject,checkoutId,api);
 expect(cancel).toHaveBeenCalledTimes(1);expect((await periods())[0].state).toBe('ACTIVE');
 await ingestWebhook(f.db,'evt_modeflow',bytes,signature,webhook,'LIVE');
 expect((await periods())[0].state).toBe('REVOKED');
 await grant();expect((await periods())[0].state).toBe('REVOKED');
});
it('reconciles due checkouts only for the configured provider mode',async()=>{
 await f.db.update(billingCheckouts).set({updatedAt:new Date(Date.now()-3600000)}).where(eq(billingCheckouts.environment,'LIVE'));
 const subscriptions=vi.fn(api.subscription);
 await reconcileDueCheckouts(f.db,{...api,keyId:'rzp_test_fixture',subscription:subscriptions});
 expect(subscriptions).not.toHaveBeenCalled();
 expect(await f.db.select().from(billingCheckouts).where(and(eq(billingCheckouts.id,checkoutId),eq(billingCheckouts.environment,'LIVE')))).toHaveLength(1);
});
