import {afterAll,beforeAll,expect,it} from 'vitest';
import {createHmac} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {billingCheckouts,jobPeriods,maintenanceStatus,operatorUsageBuckets} from '@/db/schema';
import {cancelSubscription,ingestWebhook,processBillingInbox,reconcileCheckout} from '@/server/payments/billing';
import {assertPilotCapacity,type LivePilot} from '@/server/payments/pilot';
import {createRazorpay,type RazorpayApi} from '@/server/payments/razorpay';
import {jobsFixture} from './jobs-fixture';
let f:Awaited<ReturnType<typeof jobsFixture>>,policy:LivePilot;
beforeAll(async()=>{
 f=await jobsFixture();policy={budgetKey:f.key,providerExpiresAt:new Date(Date.now()+40*86400000)};
 await f.db.update(operatorUsageBuckets).set({endsAt:policy.providerExpiresAt,providerLimitMicroUsd:5_000_000n});
 await f.db.insert(maintenanceStatus).values({name:'paid-worker:'+f.key,startedAt:new Date(),completedAt:new Date(),outcome:'COMPLETED'});
},30000);
afterAll(()=>f?.pg.close());
const capacity=()=>f.db.transaction(tx=>assertPilotCapacity(tx,policy));
it.each([1,undefined,0])('retains cancelled capacity with paid_count %s until authoritative evidence arrives',async(paidCount)=>{
 const suffix=paidCount===undefined?'unknown':'paid'+paidCount;
 const [row]=await f.db.insert(billingCheckouts).values({userId:f.owner,requestId:crypto.randomUUID(),planId:'plan_race',priceKey:'pro-live-monthly-inr-v1',environment:'LIVE',state:'READY',subscriptionId:'sub_'+suffix}).returning();
 const sub={id:row.subscriptionId!,plan_id:row.planId,quantity:1,status:'cancelled',paid_count:paidCount,current_start:100,current_end:200,notes:{checkoutId:row.id,priceKey:'pro-live-monthly-inr-v1' as const}};
 const adapter=createRazorpay({keyId:'rzp_live_fixture',keySecret:'synthetic-secret',allowLive:true},async(_url,options)=>Response.json(options?.method==='POST'?sub:{...sub,status:'created',paid_count:0,current_start:null,current_end:null}));
 await cancelSubscription(f.db,f.subject,row.id,adapter);
 await expect(capacity()).rejects.toMatchObject({code:'QUOTA'});
 expect(await f.db.select().from(jobPeriods).where(eq(jobPeriods.subscriptionId,sub.id))).toHaveLength(0);
 const provider={...adapter,subscription:async()=>({...sub,quantity:1 as const,status:'cancelled' as const}),invoices:async()=>[]} as RazorpayApi;
 await reconcileCheckout(f.db,row.id,provider);
 const bytes=Buffer.from(JSON.stringify({event:'subscription.cancelled',payload:{subscription:{entity:{id:sub.id}}}})),secret='synthetic-webhook-race-secret';
 await ingestWebhook(f.db,'evt_'+suffix,bytes,createHmac('sha256',secret).update(bytes).digest('hex'),secret,'LIVE');
 expect(await processBillingInbox(f.db,provider)).toBe(1);
 // An older active read finishing later cannot make the cancelled reservation resumable.
 await reconcileCheckout(f.db,row.id,{...provider,subscription:async()=>({...sub,quantity:1,status:'active'})});
 await expect(capacity()).rejects.toMatchObject({code:'QUOTA'});
 const now=Math.floor(Date.now()/1000),invoice={id:'inv_'+suffix,payment_id:'pay_'+suffix,status:'paid',amount:99900,amount_paid:99900,currency:'INR',billing_start:now-10,billing_end:now+2592000};
 await reconcileCheckout(f.db,row.id,{...provider,subscription:async()=>({...sub,quantity:1,status:'cancelled',paid_count:1}),invoices:async()=>[invoice],payment:async()=>({id:invoice.payment_id,invoice_id:invoice.id,status:'captured',amount:99900,currency:'INR',amount_refunded:0})});
 expect((await f.db.select().from(jobPeriods).where(eq(jobPeriods.subscriptionId,sub.id)))[0]).toMatchObject({state:'ACTIVE',jobLimit:7});
 await expect(capacity()).rejects.toMatchObject({code:'QUOTA'});
 await f.db.update(jobPeriods).set({endsAt:new Date(Date.now()-1000)}).where(eq(jobPeriods.subscriptionId,sub.id));
 await expect(capacity()).resolves.toBeUndefined();
});
it('releases a proven unpaid cancellation without creating an entitlement',async()=>{
 const [row]=await f.db.insert(billingCheckouts).values({userId:f.owner,requestId:crypto.randomUUID(),planId:'plan_unpaid',priceKey:'pro-live-monthly-inr-v1',environment:'LIVE',state:'READY',subscriptionId:'sub_unpaid'}).returning();
 const sub={id:row.subscriptionId!,plan_id:row.planId,quantity:1,status:'cancelled',paid_count:0,current_start:null,current_end:null,notes:{checkoutId:row.id,priceKey:'pro-live-monthly-inr-v1' as const}};
 const adapter=createRazorpay({keyId:'rzp_live_fixture',keySecret:'synthetic-secret',allowLive:true},async()=>Response.json(sub));
 await cancelSubscription(f.db,f.subject,row.id,adapter);
 await expect(capacity()).resolves.toBeUndefined();
 expect(await f.db.select().from(jobPeriods).where(eq(jobPeriods.subscriptionId,sub.id))).toHaveLength(0);
});
