import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {appUsers,user,operatorUsageBuckets,billingCheckouts} from '@/db/schema';
import {startCheckout} from '@/server/payments/billing';
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
 const create=vi.fn<RazorpayApi['create']>(async(id,plan)=>({id:'sub_'+id.replaceAll('-',''),plan_id:plan,status:'created',quantity:1,notes:{checkoutId:id,priceKey:liveOffer.priceKey}}));
 const api:RazorpayApi={keyId:'rzp_live_synthetic',create,plan:async()=>({id:planId,period:'monthly',interval:1,item:{amount:99900,currency:'INR'}}),cancel:unexpected,subscription:unexpected,payment:unexpected,invoices:unexpected,subscriptions:unexpected};
 const intents=subjects.map(()=>({requestId:crypto.randomUUID(),priceKey:liveOffer.priceKey}));
 const results=[];
 for(let i=0;i<subjects.length;i++)results.push(await startCheckout(f.db,subjects[i],intents[i],planId,api,policy));
 expect(results.every(r=>r.state==='READY')).toBe(true);expect(create).toHaveBeenCalledTimes(2);
 const replay=await startCheckout(f.db,subjects[0],intents[0],planId,api,policy);
 expect(replay.checkoutId).toBe(results[0].checkoutId);expect(create).toHaveBeenCalledTimes(2);
 await expect(startCheckout(f.db,subjects[0],{...intents[0],requestId:crypto.randomUUID()},planId,api,policy)).rejects.toMatchObject({code:'CONFLICT'});
 await f.db.update(billingCheckouts).set({state:'CANCELLED'}).where(eq(billingCheckouts.id,results[0].checkoutId));
 const retry=await startCheckout(f.db,subjects[0],{...intents[0],requestId:crypto.randomUUID()},planId,api,policy);
 expect(retry.state).toBe('READY');expect(create).toHaveBeenCalledTimes(3);
 expect(await f.db.select().from(operatorUsageBuckets)).toEqual(before);
 expect((await f.db.select().from(billingCheckouts).where(eq(billingCheckouts.environment,'LIVE'))).filter(r=>r.state==='READY')).toHaveLength(2);
});
