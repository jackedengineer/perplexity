import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {parse} from 'dotenv';
import {configure,runs,tasks} from '@trigger.dev/sdk';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {eq,and,inArray} from 'drizzle-orm';
import {createNeonFixture} from './admission-fixture';
import {user,billingCheckouts,billingInbox,jobPeriods} from '@/db/schema';
import {startCheckout} from '@/server/payments/billing';
import {createRazorpay,proPlan} from '@/server/payments/razorpay';

const local=parse(readFileSync('.env.local'));
const target='https://perplexity-cgpia9ezi-chiragbhugras-projects.vercel.app/api/webhooks/razorpay';
if(process.env.LIVE_HOSTED_BILLING_CHECKS!=='1'||!local.RAZORPAY_KEY_ID?.startsWith('rzp_test_')||!local.RAZORPAY_WEBHOOK_SECRET)throw new Error('Explicit TEST webhook opt-in required');
const api=createRazorpay({keyId:local.RAZORPAY_KEY_ID,keySecret:local.RAZORPAY_KEY_SECRET});
let f:ReturnType<typeof createNeonFixture>,subject:string,owner:string,checkoutId:string|undefined,subscription:string|undefined,cancelled=false;
const eventIds:string[]=[];
beforeAll(async()=>{
 f=createNeonFixture();const identity=await f.identity();subject=identity.subject;owner=identity.profile.id;
 await f.owner.update(user).set({emailVerified:true}).where(eq(user.id,subject));
});
afterAll(async()=>{
 if(!f)return;
 try{
  // Never discard an ambiguous provider create or cancel. Keep its owner and
  // intent for reconciliation; this suite never retries the billable POST.
  if(subscription&&!cancelled)throw new Error('Retained ambiguous TEST subscription for operator attention');
  if(eventIds.length)await f.owner.delete(billingInbox).where(inArray(billingInbox.eventId,eventIds));
  if(checkoutId)await f.owner.delete(billingCheckouts).where(eq(billingCheckouts.id,checkoutId));
 }finally{await f.close();}
});
it('receives an actual Razorpay-origin cancellation and grants no unpaid access',async()=>{
 const requestId=crypto.randomUUID();
 const created=await startCheckout(f.runtime,subject,{requestId,priceKey:proPlan.priceKey},local.RAZORPAY_PRO_PLAN_ID,api);
 checkoutId=created.checkoutId;subscription=created.subscriptionId??undefined;if(!subscription)throw new Error('No confirmed TEST subscription');
 // No checkout/card/customer is supplied. Cancel only this newly created TEST
 // subscription immediately to generate a genuine provider-origin event.
 const response=await fetch('https://api.razorpay.com/v1/subscriptions/'+subscription+'/cancel',{
  method:'POST',headers:{Authorization:'Basic '+Buffer.from(local.RAZORPAY_KEY_ID+':'+local.RAZORPAY_KEY_SECRET).toString('base64'),'Content-Type':'application/json'},
  body:JSON.stringify({cancel_at_cycle_end:false}),redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok){await response.body?.cancel();throw new Error('TEST cancellation was not confirmed');}
 const result=await response.json() as {id:string;status:string};cancelled=result.id===subscription&&result.status==='cancelled';expect(cancelled).toBe(true);
 const end=Date.now()+90000;let receipt:typeof billingInbox.$inferSelect|undefined;
 do{
  [receipt]=await f.owner.select().from(billingInbox).where(and(eq(billingInbox.subscriptionId,subscription),eq(billingInbox.kind,'subscription.cancelled')));
  if(receipt?.state==='APPLIED')break;await new Promise(resolve=>setTimeout(resolve,1000));
 }while(Date.now()<end);
 if(receipt)eventIds.push(receipt.eventId);
 expect(receipt).toMatchObject({kind:'subscription.cancelled',state:'APPLIED'});expect(receipt?.bodyHash).toMatch(/^[a-f0-9]{64}$/u);
 expect(await f.owner.select().from(jobPeriods).where(eq(jobPeriods.userId,owner))).toHaveLength(0);
 const [checkout]=await f.owner.select().from(billingCheckouts).where(eq(billingCheckouts.id,checkoutId));expect(checkout.state).toBe('CANCELLED');
},120000);
it('rejects forgery and acknowledges signed duplicate HTTPS deliveries only once',async()=>{
 const id='hosted_'+crypto.randomUUID().replaceAll('-','');eventIds.push(id);
 const body=JSON.stringify({event:'subscription.authenticated',payload:{subscription:{entity:{id:'sub_'+crypto.randomUUID().replaceAll('-','')}}}});
 const signature=createHmac('sha256',local.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
 const send=(signature:string)=>fetch(target,{method:'POST',headers:{'Content-Type':'application/json','X-Razorpay-Event-Id':id,'X-Razorpay-Signature':signature},body,redirect:'error',signal:AbortSignal.timeout(15000)});
 for(const expected of [400,202,202]){const r=await send(expected===400?'0'.repeat(64):signature);expect(r.status).toBe(expected);await r.body?.cancel();}
 expect(await f.owner.select().from(billingInbox).where(eq(billingInbox.eventId,id))).toHaveLength(1);
});

it('reclaims an interrupted verified inbox lease on the hosted worker',async()=>{
 if(!subscription)throw new Error('Confirmed TEST subscription required');
 const id='hosted_lease_'+crypto.randomUUID().replaceAll('-','');eventIds.push(id);
 const body=JSON.stringify({event:'subscription.cancelled',payload:{subscription:{entity:{id:subscription}}}});
 const signature=createHmac('sha256',local.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
 const response=await fetch(target,{method:'POST',headers:{'Content-Type':'application/json','X-Razorpay-Event-Id':id,'X-Razorpay-Signature':signature},body,redirect:'error',signal:AbortSignal.timeout(15000)});
 expect(response.status).toBe(202);await response.body?.cancel();
 const poll=async(check:()=>Promise<boolean>)=>{const end=Date.now()+60000;do{if(await check())return;await new Promise(resolve=>setTimeout(resolve,500));}while(Date.now()<end);throw new Error('Hosted inbox condition timed out');};
 await poll(async()=>(await f.owner.select().from(billingInbox).where(eq(billingInbox.eventId,id)))[0]?.state==='APPLIED');
 // Simulate a process dying after claim, only on this captured synthetic receipt.
 await f.owner.update(billingInbox).set({state:'PROCESSING',attempts:1,leaseToken:crypto.randomUUID(),leaseUntil:new Date(Date.now()-1000),availableAt:new Date(Date.now()-1000)}).where(eq(billingInbox.eventId,id));
 const hosted=parse(readFileSync('.env.jobs.hosted.local'));if(!hosted.TRIGGER_SECRET_KEY?.startsWith('tr_prod_sk_'))throw new Error('Hosted TEST key required');
 configure({accessToken:hosted.TRIGGER_SECRET_KEY});
 const handle=await tasks.trigger('maintain-jobs-v1',{}, {idempotencyKey:id,maxAttempts:1});
 await poll(async()=>{const run=await runs.retrieve(handle.id);if(run.isFailed||run.isCancelled)throw new Error('Hosted inbox worker failed');return run.isSuccess;});
 const [receipt]=await f.owner.select().from(billingInbox).where(eq(billingInbox.eventId,id));
 expect(receipt).toMatchObject({state:'APPLIED',attempts:2,leaseToken:null,leaseUntil:null});
 expect(await f.owner.select().from(jobPeriods).where(eq(jobPeriods.userId,owner))).toHaveLength(0);
},90000);
