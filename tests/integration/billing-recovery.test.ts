import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {appUsers,user,billingCheckouts as checkouts,jobPeriods} from '@/db/schema';
import {jobsFixture} from './jobs-fixture';
import {startCheckout} from '@/server/payments/billing';
import {proPlan,type RazorpayApi} from '@/server/payments/razorpay';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();await f.db.delete(jobPeriods);await f.db.delete(checkouts);},30000);
afterAll(()=>f?.pg.close());
async function account(){
 const subject='billing-recovery-'+crypto.randomUUID();
 await f.db.insert(user).values({id:subject,name:'Billing recovery fixture',email:subject+'@example.test',emailVerified:true});
 const [owner]=await f.db.insert(appUsers).values({authSubject:subject}).returning();return {subject,owner};
}
function apiWith(overrides:Partial<RazorpayApi>={}):RazorpayApi{
 return {keyId:'rzp_test_recovery',plan:async()=>({id:'plan_recovery',period:'monthly',interval:1,item:{amount:99900,currency:'INR'}}),
  create:async()=>{throw new Error('Unexpected subscription create');},subscription:async()=>{throw new Error('Unexpected subscription fetch');},
  subscriptions:async()=>[],invoices:async()=>[],payment:async()=>{throw new Error('Unexpected payment fetch');},cancel:async()=>{throw new Error('Unexpected cancellation');},...overrides};
}
it('allows retry after a read-only plan outage without creating an ambiguous intent',async()=>{
 const {subject,owner}=await account(),request={requestId:crypto.randomUUID(),priceKey:proPlan.priceKey};
 const healthy=apiWith(),plan=vi.fn().mockRejectedValueOnce(new Error('Read-only provider timeout')).mockImplementation(healthy.plan);
 const create=vi.fn(async(id:string)=>({id:'sub_planrecovery',plan_id:'plan_recovery',status:'created' as const,quantity:1 as const,notes:{checkoutId:id,priceKey:proPlan.priceKey}}));
 const api=apiWith({plan,create});
 await expect(startCheckout(f.db,subject,request,'plan_recovery',api)).rejects.toMatchObject({code:'UNAVAILABLE'});
 expect(create).not.toHaveBeenCalled();
 expect(await f.db.select().from(checkouts).where(eq(checkouts.userId,owner.id))).toHaveLength(0);
 expect(await startCheckout(f.db,subject,request,'plan_recovery',api)).toMatchObject({state:'READY',subscriptionId:'sub_planrecovery'});
 await startCheckout(f.db,subject,request,'plan_recovery',api);expect(create).toHaveBeenCalledTimes(1);
});

