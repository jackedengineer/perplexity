import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {billingCheckouts,jobPeriods,maintenanceStatus,operatorUsageBuckets} from '@/db/schema';
import {assertPilotCapacity,type LivePilot} from '@/server/payments/pilot';
import {reconcileCheckout} from '@/server/payments/billing';
import type {RazorpayApi} from '@/server/payments/razorpay';
import {jobsFixture} from './jobs-fixture';
let f:Awaited<ReturnType<typeof jobsFixture>>,policy:LivePilot;
beforeAll(async()=>{
 f=await jobsFixture();f.key='live-pilot-fixture';policy={budgetKey:f.key,providerExpiresAt:new Date(Date.now()+40*86400000)};
 await f.db.update(operatorUsageBuckets).set({budgetKey:f.key,endsAt:policy.providerExpiresAt,providerLimitMicroUsd:5_000_000n});
},30000);
afterAll(()=>{vi.restoreAllMocks();return f?.pg.close();});
const check=()=>f.db.transaction(tx=>assertPilotCapacity(tx,policy));
it('denies purchases without a recent completion from the actual job worker',async()=>{
 await expect(check()).rejects.toMatchObject({code:'UNAVAILABLE'});
 await f.db.insert(maintenanceStatus).values({name:'paid-worker:'+f.key,startedAt:new Date(),completedAt:new Date(),outcome:'COMPLETED'});
 await expect(check()).resolves.toBeUndefined();
});
it('rejects expired delivery windows, an excessive ceiling and spend/unknown holds without clearing them',async()=>{
 const snapshot=await f.db.select().from(operatorUsageBuckets);
 await f.db.update(operatorUsageBuckets).set({reservedProviderMicroUsd:3_000_000n});
 await expect(check()).rejects.toMatchObject({code:'QUOTA'});
 expect((await f.db.select().from(operatorUsageBuckets))[0].reservedProviderMicroUsd).toBe(3_000_000n);
 await f.db.update(operatorUsageBuckets).set({reservedProviderMicroUsd:0n,providerLimitMicroUsd:5_000_001n});
 await expect(check()).rejects.toMatchObject({code:'UNAVAILABLE'});
 for(const row of snapshot)await f.db.update(operatorUsageBuckets).set({providerLimitMicroUsd:row.providerLimitMicroUsd}).where(eq(operatorUsageBuckets.id,row.id));
 await expect(f.db.transaction(tx=>assertPilotCapacity(tx,{...policy,providerExpiresAt:new Date(Date.now()+30*86400000)}))).rejects.toMatchObject({code:'UNAVAILABLE'});
});
it('holds the sole pilot seat for uncertain/unfinished checkout instead of selling duplicate capacity',async()=>{
 const [row]=await f.db.insert(billingCheckouts).values({userId:f.owner,requestId:crypto.randomUUID(),planId:'plan_pilot',priceKey:'pro-live-monthly-inr-v1',environment:'LIVE',state:'UNKNOWN'}).returning();
 await expect(check()).rejects.toMatchObject({code:'QUOTA'});
 await expect(f.db.transaction(tx=>assertPilotCapacity(tx,policy,row.id))).rejects.toMatchObject({code:'QUOTA'});
 await f.db.update(billingCheckouts).set({state:'READY'}).where(eq(billingCheckouts.id,row.id));
 await expect(f.db.transaction(tx=>assertPilotCapacity(tx,policy,row.id))).resolves.toBeUndefined();
 await expect(f.db.transaction(tx=>assertPilotCapacity(tx,policy,crypto.randomUUID()))).rejects.toMatchObject({code:'QUOTA'});
});
it('releases a natively expired unpaid checkout but retains an active paid-through obligation',async()=>{
 const [row]=await f.db.select().from(billingCheckouts).where(eq(billingCheckouts.environment,'LIVE'));
 await f.db.update(billingCheckouts).set({subscriptionId:'sub_pilotexpiry',createdAt:new Date(Date.now()-2*3600000)}).where(eq(billingCheckouts.id,row.id));
 // Local age alone cannot prove that a mandate or payment is absent.
 await expect(check()).rejects.toMatchObject({code:'QUOTA'});
 const unexpected=async()=>{throw new Error('Unexpected provider mutation');};
 const api:RazorpayApi={keyId:'rzp_live_fixture',create:unexpected,plan:unexpected,cancel:unexpected,payment:unexpected,subscriptions:unexpected,
  subscription:async()=>({id:'sub_pilotexpiry',plan_id:row.planId,status:'expired',quantity:1,notes:{checkoutId:row.id,priceKey:'pro-live-monthly-inr-v1'}}),invoices:async()=>[]};
 await reconcileCheckout(f.db,row.id,api);
 expect((await f.db.select().from(billingCheckouts).where(eq(billingCheckouts.id,row.id)))[0].state).toBe('CANCELLED');
 await expect(check()).resolves.toBeUndefined();
 const [paid]=await f.db.insert(jobPeriods).values({userId:f.owner,subscriptionId:'sub_pilotexpiry',environment:'LIVE',paymentId:'pay_pilotexpiry',invoiceId:'inv_pilotexpiry',
  startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+30*86400000),jobLimit:7}).returning();
 await expect(check()).rejects.toMatchObject({code:'QUOTA'});
 await f.db.update(jobPeriods).set({state:'REVOKED'}).where(eq(jobPeriods.id,paid.id));
 await expect(check()).resolves.toBeUndefined();
});
