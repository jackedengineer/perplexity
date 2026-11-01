import {reconcileDueCheckouts} from '@/server/payments/maintenance';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {appUsers,user,billingCheckouts as checkouts,jobPeriods,billingReversals} from '@/db/schema';
import {jobsFixture} from './jobs-fixture';
import {startCheckout,reconcileCheckout} from '@/server/payments/billing';
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

it('backs off failed oldest checkouts so a missed captured invoice is eventually reconciled',async()=>{
 const old=new Date(Date.now()-3600000),rows: (typeof checkouts.$inferSelect)[]=[];
 for(let i=0;i<4;i++){
  const {owner}=await account();
  const [row]=await f.db.insert(checkouts).values({userId:owner.id,requestId:crypto.randomUUID(),planId:'plan_recovery',priceKey:proPlan.priceKey,environment:'TEST',state:i===3?'READY':'UNKNOWN',subscriptionId:i===3?'sub_fairbatch':null,updatedAt:new Date(old.getTime()+i)}).returning();rows.push(row);
 }
 const paid=rows[3],now=Math.floor(Date.now()/1000),subscriptions=vi.fn(async()=>[]);
 const api=apiWith({subscriptions,subscription:async()=>({id:paid.subscriptionId!,plan_id:paid.planId,status:'active',quantity:1,notes:{checkoutId:paid.id,priceKey:proPlan.priceKey}}),
  invoices:async()=>[{id:'inv_fairbatch',payment_id:'pay_fairbatch',status:'paid',amount:99900,amount_paid:99900,currency:'INR',billing_start:now-10,billing_end:now+2592000}],
  payment:async()=>({id:'pay_fairbatch',invoice_id:'inv_fairbatch',status:'captured',amount:99900,currency:'INR',amount_refunded:0})});
 await reconcileDueCheckouts(f.db,api);
 expect(await f.db.select().from(jobPeriods).where(eq(jobPeriods.userId,paid.userId))).toHaveLength(0);
 for(const row of rows.slice(0,3)){
  const [saved]=await f.db.select().from(checkouts).where(eq(checkouts.id,row.id));expect(saved.state).toBe('UNKNOWN');expect(saved.updatedAt.getTime()).toBeGreaterThan(old.getTime()+4);
 }
 await reconcileDueCheckouts(f.db,api);
 expect(await f.db.select().from(jobPeriods).where(eq(jobPeriods.userId,paid.userId))).toHaveLength(1);
 expect(subscriptions).toHaveBeenCalledTimes(3);
});

for(const refund of [{status:'refunded',amount_refunded:99900},{status:'captured',amount_refunded:100}]){
 it(`revokes a missed ${refund.status==='refunded'?'full':'partial'} refund and rejects delayed capture regrant`,async()=>{
  const {owner}=await account(),suffix=crypto.randomUUID().replaceAll('-','');
  const [row]=await f.db.insert(checkouts).values({userId:owner.id,requestId:crypto.randomUUID(),planId:'plan_recovery',priceKey:proPlan.priceKey,environment:'TEST',state:'READY',subscriptionId:'sub_'+suffix}).returning();
  const now=Math.floor(Date.now()/1000),invoice={id:'inv_'+suffix,payment_id:'pay_'+suffix,status:'paid',amount:99900,amount_paid:99900,currency:'INR',billing_start:now-10,billing_end:now+2592000};
  let payment={id:invoice.payment_id,invoice_id:invoice.id,status:'captured',amount:99900,currency:'INR',amount_refunded:0};
  const api=apiWith({subscription:async()=>({id:row.subscriptionId!,plan_id:row.planId,status:'active',quantity:1,notes:{checkoutId:row.id,priceKey:proPlan.priceKey}}),invoices:async()=>[invoice],payment:async()=>payment});
  await reconcileCheckout(f.db,row.id,api);
  const period=async()=>(await f.db.select().from(jobPeriods).where(eq(jobPeriods.paymentId,invoice.payment_id)))[0];
  expect((await period()).state).toBe('ACTIVE');
  const captured={...payment};
  for(const invalid of [{id:'pay_unrelated'},{invoice_id:'inv_unrelated'},{currency:'USD'},{amount:100}]){
   payment={...captured,...refund,...invalid};await reconcileCheckout(f.db,row.id,api);
   expect((await period()).state).toBe('ACTIVE');
   expect(await f.db.select().from(billingReversals).where(eq(billingReversals.paymentId,invoice.payment_id))).toHaveLength(0);
  }
  payment={...captured,...refund};await reconcileCheckout(f.db,row.id,api);
  expect((await period()).state).toBe('REVOKED');
  await reconcileCheckout(f.db,row.id,api);
  payment={...payment,status:'captured',amount_refunded:0};await reconcileCheckout(f.db,row.id,api);
  expect((await period()).state).toBe('REVOKED');
  expect(await f.db.select().from(billingReversals).where(eq(billingReversals.paymentId,invoice.payment_id))).toHaveLength(1);
 });
}
