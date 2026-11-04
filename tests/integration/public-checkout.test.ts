import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {appUsers,user,operatorUsageBuckets,billingCheckouts,jobPeriods} from '@/db/schema';
import {cancelSubscription,startCheckout} from '@/server/payments/billing';
import {liveOffer} from '@/server/payments/offer';
import type {RazorpayApi} from '@/server/payments/razorpay';
import {jobsFixture} from './jobs-fixture';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);
afterAll(()=>f?.pg.close());
it('opens independent public checkouts without granting access or changing inference budgets',async()=>{
 const subjects:string[]=[];
 for(let i=0;i<2;i++){
  const subject=crypto.randomUUID();subjects.push(subject);
  await f.db.insert(user).values({id:subject,name:'Public checkout fixture',email:subject+'@example.test',emailVerified:true});
  await f.db.insert(appUsers).values({authSubject:subject});
 }
 await f.db.update(operatorUsageBuckets).set({providerLimitMicroUsd:100000n,reservedProviderMicroUsd:100000n});
 const before=await f.db.select().from(operatorUsageBuckets);
 const planId='plan_public',policy={budgetKey:f.key,providerExpiresAt:new Date(Date.now()+86400000),publicCheckout:true};
 const unexpected=async()=>{throw Error('Unexpected provider action');};
 const subscriptions=new Map<string,Awaited<ReturnType<RazorpayApi['create']>>>();
 const create=vi.fn<RazorpayApi['create']>(async(id,plan)=>{
  const sub={id:'sub_'+id.replaceAll('-',''),plan_id:plan,status:'created' as const,quantity:1 as const,notes:{checkoutId:id,priceKey:liveOffer.priceKey}};
  subscriptions.set(sub.id,sub);return sub;
 });
 const api:RazorpayApi={keyId:'rzp_live_synthetic',create,plan:async()=>({id:planId,period:'monthly',interval:1,item:{amount:99900,currency:'INR'}}),cancel:async id=>({...subscriptions.get(id)!,status:'cancelled',paid_count:0,current_start:null,current_end:null}),subscription:unexpected,payment:unexpected,invoices:unexpected,subscriptions:unexpected};
 const intents=subjects.map(()=>({requestId:crypto.randomUUID(),priceKey:liveOffer.priceKey}));
 const results=[];
 for(let i=0;i<subjects.length;i++)results.push(await startCheckout(f.db,subjects[i],intents[i],planId,api,policy));
 expect(results.every(r=>r.state==='READY')).toBe(true);expect(create).toHaveBeenCalledTimes(2);
 const replay=await startCheckout(f.db,subjects[0],intents[0],planId,api,policy);
 expect(replay.checkoutId).toBe(results[0].checkoutId);expect(create).toHaveBeenCalledTimes(2);
 await expect(startCheckout(f.db,subjects[0],{...intents[0],requestId:crypto.randomUUID()},planId,api,policy)).rejects.toMatchObject({code:'CONFLICT'});
 await cancelSubscription(f.db,subjects[0],results[0].checkoutId,api);
 const rowsBeforeRetry=await f.db.select().from(billingCheckouts);
 // Fresh request IDs cannot turn unpaid cancellation into subscription churn.
 for(let i=0;i<3;i++)await expect(startCheckout(f.db,subjects[0],{...intents[0],requestId:crypto.randomUUID()},planId,api,policy)).rejects.toMatchObject({code:'QUOTA'});
 expect(create).toHaveBeenCalledTimes(2);
 expect(await f.db.select().from(billingCheckouts)).toEqual(rowsBeforeRetry);
 expect(await startCheckout(f.db,subjects[0],intents[0],planId,api,policy)).toMatchObject({checkoutId:results[0].checkoutId,state:'CANCELLED'});
 await f.db.update(billingCheckouts).set({createdAt:new Date(Date.now()-25*3600000)}).where(eq(billingCheckouts.id,results[0].checkoutId));
 const retry=await startCheckout(f.db,subjects[0],{...intents[0],requestId:crypto.randomUUID()},planId,api,policy);
 expect(retry.state).toBe('READY');expect(create).toHaveBeenCalledTimes(3);
 expect(await f.db.select().from(operatorUsageBuckets)).toEqual(before);
 expect((await f.db.select().from(billingCheckouts).where(eq(billingCheckouts.environment,'LIVE'))).filter(r=>r.state==='READY')).toHaveLength(2);
});

it('blocks repeat buying only for the owner whose completed payment lacks an invoice',async()=>{
 const subscriptionId='sub_public_completed',planId='plan_public_completed';
 await f.db.insert(billingCheckouts).values({userId:f.owner,requestId:crypto.randomUUID(),priceKey:liveOffer.priceKey,environment:'LIVE',planId,subscriptionId,state:'COMPLETED',createdAt:new Date(Date.now()-32*86400000)});
 const unexpected=async()=>{throw Error('Unexpected provider action');};
 const create=vi.fn<RazorpayApi['create']>(async(id,plan)=>({id:'sub_'+id.replaceAll('-',''),plan_id:plan,status:'created',quantity:1,notes:{checkoutId:id,priceKey:liveOffer.priceKey}}));
 const api:RazorpayApi={keyId:'rzp_live_synthetic',create,plan:async()=>({id:planId,period:'monthly',interval:1,item:{amount:99900,currency:'INR'}}),cancel:unexpected,subscription:unexpected,payment:unexpected,invoices:unexpected,subscriptions:unexpected};
 const policy={budgetKey:f.key,providerExpiresAt:new Date(Date.now()+86400000),publicCheckout:true};
 const input={requestId:crypto.randomUUID(),priceKey:liveOffer.priceKey};
 await expect(startCheckout(f.db,f.subject,input,planId,api,policy)).rejects.toMatchObject({code:'CONFLICT'});
 expect(create).not.toHaveBeenCalled();
 const other=crypto.randomUUID();
 await f.db.insert(user).values({id:other,name:'Independent buyer',email:other+'@example.test',emailVerified:true});
 await f.db.insert(appUsers).values({authSubject:other});
 expect((await startCheckout(f.db,other,{...input,requestId:crypto.randomUUID()},planId,api,policy)).state).toBe('READY');
 // Once its invoice has been reconciled and the paid period has ended, this
 // owner can purchase again. A terminal checkout alone was not that evidence.
 await f.db.insert(jobPeriods).values({userId:f.owner,subscriptionId,environment:'LIVE',paymentId:'pay_public_completed',invoiceId:'inv_public_completed',startsAt:new Date(Date.now()-32*86400000),endsAt:new Date(Date.now()-86400000),jobLimit:7});
 expect((await startCheckout(f.db,f.subject,input,planId,api,policy)).state).toBe('READY');
 expect(create).toHaveBeenCalledTimes(2);
});
