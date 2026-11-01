import {createHash,randomUUID} from 'node:crypto';
import {and,eq,gt,inArray,lte,or,sql} from 'drizzle-orm';
import {billingCheckouts as checkouts,billingInbox as inbox,billingReversals as reversals,jobPeriods as periods,appUsers} from '@/db/schema';
import {JobError} from '@/server/jobs/contracts';
import {databaseNow,ownerFor,type JobDatabase,type JobTransaction} from '@/server/jobs/store';
import {checkoutInput,confirmationInput,proPlan,normalizeWebhook,verifySignature,verifyCycle,invoiceSchema,type RazorpayApi} from './razorpay';
type Checkout=typeof checkouts.$inferSelect;
const view=(row:Checkout,keyId:string)=>({checkoutId:row.id,subscriptionId:row.subscriptionId,keyId,state:row.state,mode:'TEST' as const,priceKey:row.priceKey});
export async function startCheckout(db:JobDatabase,subject:string,raw:unknown,planId:string,api:RazorpayApi){
 const input=checkoutInput.parse(raw);
 const prepared=await db.transaction(async tx=>{
  const owner=await ownerFor(tx,subject);await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'billing:'+owner},0))`);
  const [prior]=await tx.select().from(checkouts).where(and(eq(checkouts.userId,owner),eq(checkouts.requestId,input.requestId)));
  if(prior){if(prior.priceKey!==input.priceKey||prior.planId!==planId)throw new JobError('CONFLICT');return {row:prior,create:false};}
  const [open]=await tx.select().from(checkouts).where(and(eq(checkouts.userId,owner),inArray(checkouts.state,['CREATING','READY','UNKNOWN']))).limit(1);
  if(open)throw new JobError('CONFLICT');
  const [active]=await tx.select({id:periods.id}).from(periods).where(and(eq(periods.userId,owner),eq(periods.state,'ACTIVE'),gt(periods.endsAt,sql`clock_timestamp()`))).limit(1);
  if(active)throw new JobError('CONFLICT');
  const [row]=await tx.insert(checkouts).values({userId:owner,requestId:input.requestId,priceKey:input.priceKey,environment:'TEST',planId,state:'CREATING'}).returning();return {row,create:true};
 });
 if(!prepared.create)return view(prepared.row,api.keyId);
 try{
  await api.plan(planId);const created=await api.create(prepared.row.id,planId);
  if(created.notes.checkoutId!==prepared.row.id||created.plan_id!==planId)throw new JobError('UNAVAILABLE');
  const [row]=await db.update(checkouts).set({subscriptionId:created.id,state:'READY',providerState:created.status,updatedAt:sql`clock_timestamp()`}).where(and(eq(checkouts.id,prepared.row.id),eq(checkouts.state,'CREATING'))).returning();
  if(!row)throw new JobError('CONFLICT');return view(row,api.keyId);
 }catch{
  await db.update(checkouts).set({state:'UNKNOWN',updatedAt:sql`clock_timestamp()`}).where(and(eq(checkouts.id,prepared.row.id),eq(checkouts.state,'CREATING')));
  throw new JobError('UNAVAILABLE');
 }
}
async function ownedCheckout(db:JobDatabase,subject:string,id:string){
 const [row]=await db.select({checkout:checkouts}).from(checkouts).innerJoin(appUsers,eq(appUsers.id,checkouts.userId)).where(and(eq(checkouts.id,id),eq(appUsers.authSubject,subject)));
 if(!row)throw new JobError('NOT_FOUND');return row.checkout;
}
async function lockedCheckout(tx:JobTransaction,id:string){
 const [row]=await tx.select().from(checkouts).where(eq(checkouts.id,id)).for('update');if(!row)throw new JobError('NOT_FOUND');return row;
}
async function reconcileCycles(db:JobDatabase,row:Checkout,api:RazorpayApi,onlyPayment?:string,deadline=performance.now()+10000){
 if(!row.subscriptionId)throw new JobError('CONFLICT');
 const sub=await api.subscription(row.subscriptionId);
 if(sub.id!==row.subscriptionId||sub.plan_id!==row.planId||sub.notes.checkoutId!==row.id||sub.notes.priceKey!==row.priceKey)throw new JobError('CONFLICT');
 const invoices=await api.invoices(sub.id);
 let verified=0;
 for(const raw of invoices){
  if(performance.now()>=deadline)throw new JobError('UNAVAILABLE');
  const parsed=invoiceSchema.safeParse(raw);if(!parsed.success||onlyPayment&&parsed.data.payment_id!==onlyPayment)continue;
  if(verified++>=12)throw new JobError('UNAVAILABLE');
  const payment=await api.payment(parsed.data.payment_id);let cycle:ReturnType<typeof verifyCycle>;
  try{cycle=verifyCycle(parsed.data,payment);}catch{continue;}
  await db.transaction(async tx=>{
   const current=await lockedCheckout(tx,row.id);if(current.subscriptionId!==sub.id||current.environment!=='TEST')throw new JobError('CONFLICT');
   // Serialize against signed refunds/disputes before inspecting their tombstone.
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'payment:'+cycle.paymentId},0))`);
   if((await tx.select().from(reversals).where(eq(reversals.paymentId,cycle.paymentId))).length)return;
   await tx.insert(periods).values({...cycle,userId:row.userId,subscriptionId:sub.id,environment:'TEST',jobLimit:proPlan.sandboxChecks}).onConflictDoNothing();
   const [saved]=await tx.select().from(periods).where(eq(periods.paymentId,cycle.paymentId));
   if(!saved||saved.userId!==row.userId||saved.subscriptionId!==sub.id||saved.invoiceId!==cycle.invoiceId)throw new JobError('CONFLICT');
  });
 }
 const next=sub.status==='cancelled'||sub.status==='expired'?'CANCELLED':sub.status==='completed'?'COMPLETED':'READY';
 await db.update(checkouts).set({providerState:sql`CASE WHEN ${checkouts.state} IN ('CANCELLED','COMPLETED') THEN ${checkouts.providerState} ELSE ${sub.status} END`,state:sql`CASE WHEN ${checkouts.state} IN ('CANCELLED','COMPLETED') THEN ${checkouts.state} ELSE ${next} END`,updatedAt:sql`clock_timestamp()`}).where(eq(checkouts.id,row.id));
}
export async function confirmCheckout(db:JobDatabase,subject:string,raw:unknown,secret:string,api:RazorpayApi){
 const input=confirmationInput.parse(raw),row=await ownedCheckout(db,subject,input.checkoutId);
 if(!row.subscriptionId||input.razorpay_subscription_id!==row.subscriptionId||!verifySignature(Buffer.from(input.razorpay_payment_id+'|'+row.subscriptionId),input.razorpay_signature,secret))throw new JobError('INVALID_INPUT');
 await reconcileCycles(db,row,api,input.razorpay_payment_id);
}
export async function cancelSubscription(db:JobDatabase,subject:string,id:string,api:RazorpayApi){
 const row=await ownedCheckout(db,subject,id);if(!row.subscriptionId)throw new JobError('CONFLICT');
 if(row.cancelAtCycleEnd)return;
 const sub=await api.cancel(row.subscriptionId);
 if(sub.id!==row.subscriptionId||sub.notes.checkoutId!==row.id)throw new JobError('CONFLICT');
 await db.update(checkouts).set({cancelAtCycleEnd:true,providerState:sub.status,state:sub.status==='cancelled'?'CANCELLED':row.state,updatedAt:sql`clock_timestamp()`}).where(eq(checkouts.id,row.id));
 // The verified invoice retains its own paid-through timestamp; no new grant.
}
export async function ingestWebhook(db:JobDatabase,eventId:string,bytes:Uint8Array,signature:string,secret:string){
 if(bytes.byteLength>65536||!/^[-A-Za-z0-9_]{1,100}$/u.test(eventId)||!verifySignature(bytes,signature,secret))throw new JobError('INVALID_INPUT');
 let parsed:unknown;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new JobError('INVALID_INPUT');}
 const event=normalizeWebhook(parsed),bodyHash=createHash('sha256').update(bytes).digest('hex');
 await db.transaction(async tx=>{
  await tx.insert(inbox).values({eventId,bodyHash,...event}).onConflictDoNothing();
  const [prior]=await tx.select().from(inbox).where(eq(inbox.eventId,eventId));if(prior.bodyHash!==bodyHash)throw new JobError('CONFLICT');
  if(event.paymentId&&(event.kind==='payment.refunded'||event.kind==='refund.processed'||event.kind==='payment.dispute.created')){
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'payment:'+event.paymentId},0))`);
   await tx.insert(reversals).values({paymentId:event.paymentId,reason:event.kind}).onConflictDoNothing();
   await tx.update(periods).set({state:'REVOKED'}).where(eq(periods.paymentId,event.paymentId));
  }
 });
}
export async function reconcileCheckout(db:JobDatabase,id:string,api:RazorpayApi){
 let [row]=await db.select().from(checkouts).where(eq(checkouts.id,id));if(!row)throw new JobError('NOT_FOUND');
 if(!row.subscriptionId){
  const matches=(await api.subscriptions()).filter(sub=>sub.notes.checkoutId===row.id&&sub.plan_id===row.planId);
  if(matches.length!==1)throw new JobError('CONFLICT');const match=matches[0];
  [row]=await db.update(checkouts).set({subscriptionId:match.id,state:'READY',providerState:match.status,updatedAt:sql`clock_timestamp()`}).where(and(eq(checkouts.id,id),sql`${checkouts.subscriptionId} IS NULL`)).returning();
  if(!row)throw new JobError('CONFLICT');
 }
 await reconcileCycles(db,row,api);
}
export async function processBillingInbox(db:JobDatabase,api:RazorpayApi,limit=5,deadline=performance.now()+15000){
 let applied=0;
 for(let i=0;i<Math.min(10,Math.max(1,limit))&&performance.now()<deadline;i++){
  const claim=await db.transaction(async tx=>{
   const now=await databaseNow(tx);
   const [row]=await tx.select().from(inbox).where(and(lte(inbox.availableAt,now),sql`${inbox.attempts}<10`,or(eq(inbox.state,'PENDING'),and(eq(inbox.state,'PROCESSING'),lte(inbox.leaseUntil,now)))))
    .orderBy(inbox.availableAt,inbox.eventId).limit(1).for('update',{skipLocked:true});
   if(!row)return null;const token=randomUUID();await tx.update(inbox).set({state:'PROCESSING',attempts:row.attempts+1,leaseToken:token,leaseUntil:new Date(now.getTime()+30000)}).where(eq(inbox.eventId,row.eventId));return {...row,token};
  });
  if(!claim)break;let success=false;
  try{
   if(claim.subscriptionId){const [row]=await db.select().from(checkouts).where(eq(checkouts.subscriptionId,claim.subscriptionId));if(row)await reconcileCycles(db,row,api,claim.kind==='subscription.charged'?claim.paymentId??undefined:undefined);}
   success=true;
  }catch{/* Provider ambiguity retains the durable inbox record for bounded retry. */}
  await db.update(inbox).set({state:success?'APPLIED':claim.attempts+1>=10?'ATTENTION':'PENDING',leaseToken:null,leaseUntil:null,availableAt:sql`clock_timestamp()+interval '1 minute'`})
   .where(and(eq(inbox.eventId,claim.eventId),eq(inbox.leaseToken,claim.token),gt(inbox.leaseUntil,sql`clock_timestamp()`)));
  if(success)applied++;
 }
 return applied;
}
export async function billingStatus(db:JobDatabase,subject:string){
 const rows=await db.select({checkout:checkouts}).from(checkouts).innerJoin(appUsers,eq(appUsers.id,checkouts.userId)).where(eq(appUsers.authSubject,subject)).orderBy(sql`${checkouts.createdAt} DESC`).limit(5);
 const access=await db.select({period:periods}).from(periods).innerJoin(appUsers,eq(appUsers.id,periods.userId)).where(and(eq(appUsers.authSubject,subject),eq(periods.state,'ACTIVE'),lte(periods.startsAt,sql`clock_timestamp()`),gt(periods.endsAt,sql`clock_timestamp()`))).orderBy(periods.endsAt).limit(1);
 return {mode:'TEST',priceKey:proPlan.priceKey,amountPaise:proPlan.amountPaise,currency:proPlan.currency,checkouts:rows.map(({checkout:c})=>({id:c.id,requestId:c.requestId,state:c.state,providerState:c.providerState,cancelAtCycleEnd:c.cancelAtCycleEnd,subscriptionId:c.subscriptionId})),access:access[0]?{endsAt:access[0].period.endsAt.toISOString(),remaining:access[0].period.jobLimit-access[0].period.reservedJobs-access[0].period.spentJobs}:null};
}
