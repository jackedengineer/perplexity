import {afterAll,beforeAll,expect,it} from 'vitest';
import {createHmac} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {billingCheckouts,billingInbox,billingReversals,jobPeriods,user,operatorUsageBuckets,maintenanceStatus} from '@/db/schema';
import type {LivePilot} from '@/server/payments/pilot';
import {cancelSubscription,confirmCheckout,ingestWebhook,startCheckout} from '@/server/payments/billing';
import {liveOffer} from '@/server/payments/offer';
import type {RazorpayApi} from '@/server/payments/razorpay';
import {admitJob} from '@/server/jobs/admission';
import {createNeonFixture,simultaneously} from './admission-fixture';
let f:ReturnType<typeof createNeonFixture>,subject='',owner='',checkoutId='',pilot:LivePilot;
const suffix=crypto.randomUUID().replaceAll('-',''),subId='sub_'+suffix,payId='pay_'+suffix,invId='inv_'+suffix,eventId='evt_'+suffix;
const secret='synthetic-live-neon-signing-secret',now=Math.floor(Date.now()/1000);
const subscription=()=>({id:subId,plan_id:'plan_neonlive',status:'active' as const,quantity:1 as const,notes:{checkoutId,priceKey:liveOffer.priceKey}});
const api:RazorpayApi={keyId:'rzp_live_syntheticneon',plan:async()=>({id:'plan_neonlive',period:'monthly',interval:1,item:{amount:99900,currency:'INR'}}),
 create:async id=>{checkoutId=id;return subscription();},subscription:async()=>subscription(),subscriptions:async()=>[subscription()],
 invoices:async()=>[{id:invId,payment_id:payId,status:'paid',amount:99900,amount_paid:99900,currency:'INR',billing_start:now-10,billing_end:now+2592000}],
 payment:async()=>({id:payId,invoice_id:invId,status:'captured',amount:99900,currency:'INR',amount_refunded:0}),cancel:async()=>({...subscription(),status:'cancelled'})};
beforeAll(async()=>{f=createNeonFixture();const identity=await f.identity();subject=identity.subject;owner=identity.profile.id;await f.owner.update(user).set({emailVerified:true}).where(eq(user.id,subject));
 pilot={budgetKey:f.namespace,providerExpiresAt:new Date(Date.now()+40*86400000)};await f.budgets(5_000_000n);
 await f.owner.update(operatorUsageBuckets).set({endsAt:pilot.providerExpiresAt}).where(eq(operatorUsageBuckets.budgetKey,f.namespace));
 await f.owner.insert(maintenanceStatus).values({name:'paid-worker:'+f.namespace,startedAt:new Date(),completedAt:new Date(),outcome:'COMPLETED'});
});
afterAll(async()=>{if(!f)return;try{
 await f.owner.delete(billingInbox).where(eq(billingInbox.eventId,eventId));
 await f.owner.delete(billingReversals).where(eq(billingReversals.paymentId,payId));
 await f.owner.delete(maintenanceStatus).where(eq(maintenanceStatus.name,'paid-worker:'+f.namespace));
 if(owner){await f.owner.delete(jobPeriods).where(eq(jobPeriods.userId,owner));await f.owner.delete(billingCheckouts).where(eq(billingCheckouts.userId,owner));}
}finally{await f.close();}});
it('creates and concurrently reconciles one seven-run LIVE receipt using restricted development PostgreSQL',async()=>{
 await startCheckout(f.runtime,subject,{requestId:crypto.randomUUID(),priceKey:liveOffer.priceKey},'plan_neonlive',api,pilot);
 const input={checkoutId,razorpay_subscription_id:subId,razorpay_payment_id:payId,razorpay_signature:createHmac('sha256',secret).update(payId+'|'+subId).digest('hex')};
 await simultaneously([()=>confirmCheckout(f.runtime,subject,input,secret,api),()=>confirmCheckout(f.runtime,subject,input,secret,api)]);
 const rows=await f.runtime.select().from(jobPeriods).where(eq(jobPeriods.userId,owner));
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({environment:'LIVE',jobLimit:7,reservedJobs:0,spentJobs:0});
 await expect(f.runtime.update(jobPeriods).set({jobLimit:100}).where(eq(jobPeriods.id,rows[0].id))).rejects.toMatchObject({cause:{code:'42501'}});
 await expect(admitJob(f.runtime,subject,{version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()},f.namespace)).rejects.toMatchObject({code:'PAYMENT_REQUIRED'});
});
it('keeps cancellation and refund settlement available without a job or operator grant',async()=>{
 await cancelSubscription(f.runtime,subject,checkoutId,api);
 expect((await f.runtime.select().from(jobPeriods).where(eq(jobPeriods.userId,owner)))[0].state).toBe('ACTIVE');
 const raw=Buffer.from(JSON.stringify({event:'payment.refunded',payload:{payment:{entity:{id:payId}}}}));
 await ingestWebhook(f.runtime,eventId,raw,createHmac('sha256',secret).update(raw).digest('hex'),secret,'LIVE');
 expect((await f.runtime.select().from(jobPeriods).where(eq(jobPeriods.userId,owner)))[0].state).toBe('REVOKED');
 expect((await f.runtime.select().from(billingInbox).where(eq(billingInbox.eventId,eventId)))[0].environment).toBe('LIVE');
});
