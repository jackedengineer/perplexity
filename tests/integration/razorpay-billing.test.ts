import {beforeAll,afterAll,it,expect} from 'vitest';
import {createHmac} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {billingCheckouts,jobPeriods,billingInbox,billingReversals} from '@/db/schema';
import {jobsFixture} from './jobs-fixture';
import {startCheckout,confirmCheckout,ingestWebhook,processBillingInbox,reconcileCheckout,cancelSubscription} from '@/server/payments/billing';
import {proPlan,type RazorpayApi} from '@/server/payments/razorpay';
let f:Awaited<ReturnType<typeof jobsFixture>>;const secret='razorpay-test-secret-for-signatures',webhook='webhook-test-secret-for-signatures';let creations=0,refunded=false;
let checkoutId='';const sub=()=>({id:'sub_billing',plan_id:'plan_billing',status:'active' as const,quantity:1 as const,notes:{checkoutId,priceKey:proPlan.priceKey}});
const now=Math.floor(Date.now()/1000),invoice=()=>({id:'inv_billing',payment_id:'pay_billing',status:'paid',amount:99900,amount_paid:99900,currency:'INR',billing_start:now-10,billing_end:now+2592000});
const payment=()=>({id:'pay_billing',invoice_id:'inv_billing',status:'captured',amount:99900,currency:'INR',amount_refunded:refunded?99900:0});
const api:RazorpayApi={keyId:'rzp_test_billing',plan:async()=>({id:'plan_billing',period:'monthly',interval:1,item:{amount:99900,currency:'INR'}}),create:async id=>{creations++;checkoutId=id;return sub();},subscription:async()=>sub(),subscriptions:async()=>[sub()],invoices:async()=>[invoice()],payment:async()=>payment(),cancel:async()=>({...sub(),status:'cancelled'})};
beforeAll(async()=>{f=await jobsFixture();await f.db.delete(jobPeriods);await f.db.delete(billingCheckouts);},30000);afterAll(()=>f?.pg.close());
const start=()=>startCheckout(f.db,f.subject,{requestId:crypto.randomUUID(),priceKey:proPlan.priceKey},'plan_billing',api);
it('creates once, binds owner/price and refuses to grant on checkout creation alone',async()=>{
 const input={requestId:crypto.randomUUID(),priceKey:proPlan.priceKey};const first=await startCheckout(f.db,f.subject,input,'plan_billing',api);
 expect(await startCheckout(f.db,f.subject,input,'plan_billing',api)).toEqual(first);expect(creations).toBe(1);
 expect(await f.db.select().from(jobPeriods)).toHaveLength(0);
 await expect(confirmCheckout(f.db,'other',{checkoutId:first.checkoutId,razorpay_subscription_id:'sub_billing',razorpay_payment_id:'pay_billing',razorpay_signature:'a'.repeat(64)},secret,api)).rejects.toMatchObject({code:'NOT_FOUND'});
});
it('verifies callback against server-stored subscription and grants one captured invoice exactly once',async()=>{
 const [row]=await f.db.select().from(billingCheckouts);
 const body={checkoutId:row.id,razorpay_subscription_id:'sub_billing',razorpay_payment_id:'pay_billing',razorpay_signature:createHmac('sha256',secret).update('pay_billing|sub_billing').digest('hex')};
 await expect(confirmCheckout(f.db,f.subject,{...body,razorpay_signature:'a'.repeat(64)},secret,api)).rejects.toThrow();
 await confirmCheckout(f.db,f.subject,body,secret,api);await confirmCheckout(f.db,f.subject,body,secret,api);
 expect((await f.db.select().from(jobPeriods))).toHaveLength(1);
 expect((await f.db.select().from(jobPeriods))[0]).toMatchObject({environment:'TEST',jobLimit:10,paymentId:'pay_billing'});
});
const event=(kind:string)=>Buffer.from(JSON.stringify({event:kind,payload:{subscription:{entity:{id:'sub_billing'}},payment:{entity:{id:'pay_billing'}}}}));
const ingest=(id:string,kind:string)=>{const raw=event(kind);return ingestWebhook(f.db,id,raw,createHmac('sha256',webhook).update(raw).digest('hex'),webhook);};
it('durably deduplicates signed events and rejects conflicting event IDs or forged bytes',async()=>{
 await ingest('evt_billing','subscription.charged');await ingest('evt_billing','subscription.charged');
 expect(await f.db.select().from(billingInbox)).toHaveLength(1);
 await expect(ingest('evt_billing','subscription.cancelled')).rejects.toMatchObject({code:'CONFLICT'});
 await expect(ingestWebhook(f.db,'evt_forged',event('subscription.charged'),'a'.repeat(64),webhook)).rejects.toThrow();
 expect(await processBillingInbox(f.db,api)).toBe(1);
 expect(await f.db.select().from(jobPeriods)).toHaveLength(1);
});
it('retains paid-through after cancellation and never regrants refunded cycles from delayed events',async()=>{
 const [row]=await f.db.select().from(billingCheckouts);await cancelSubscription(f.db,f.subject,row.id,api);
 expect((await f.db.select().from(jobPeriods))[0].state).toBe('ACTIVE');
 refunded=true;await ingest('evt_refund','payment.refunded');await processBillingInbox(f.db,api);
 expect((await f.db.select().from(jobPeriods))[0].state).toBe('REVOKED');
 expect(await f.db.select().from(billingReversals)).toHaveLength(1);
 refunded=false;await ingest('evt_late','subscription.charged');await processBillingInbox(f.db,api);
 expect((await f.db.select().from(jobPeriods))[0].state).toBe('REVOKED');
});
it('holds an ambiguous create without trying a second subscription and reconciles by server checkout notes',async()=>{
 const id=crypto.randomUUID();await f.db.insert(billingCheckouts).values({id,userId:f.owner,requestId:crypto.randomUUID(),planId:'plan_billing',priceKey:proPlan.priceKey,environment:'TEST',state:'UNKNOWN'});
 await expect(start()).rejects.toMatchObject({code:'CONFLICT'});expect(creations).toBe(1);
 checkoutId=id;await reconcileCheckout(f.db,id,{...api,subscriptions:async()=>[{...sub(),id:'sub_recovered'}],subscription:async()=>({...sub(),id:'sub_recovered'}),invoices:async()=>[]});
 expect((await f.db.select().from(billingCheckouts).where(eq(billingCheckouts.id,id)))[0]).toMatchObject({state:'READY',subscriptionId:'sub_recovered'});
});
