import {and,eq,inArray,lt,sql} from 'drizzle-orm';
import {billingCheckouts as checkouts} from '@/db/schema';
import type {JobDatabase} from '@/server/jobs/store';
import {type RazorpayApi} from './razorpay';
import {paymentConfiguration} from './config';
import {paymentMode} from './offer';
import {processBillingInbox,reconcileCheckout} from './billing';
export async function maintainBilling(db:JobDatabase){
 let api:RazorpayApi;try{api=paymentConfiguration().api;}catch{return;}
 const deadline=performance.now()+15000;await processBillingInbox(db,api,5,deadline);
 await reconcileDueCheckouts(db,api,deadline);
}
export async function reconcileDueCheckouts(db:JobDatabase,api:RazorpayApi,deadline=performance.now()+15000){
 const rows=await db.select({id:checkouts.id,updatedAt:checkouts.updatedAt}).from(checkouts).where(sql`${eq(checkouts.environment,paymentMode(api.keyId))} AND ${inArray(checkouts.state,['CREATING','UNKNOWN','READY','CANCELLED','COMPLETED'])} AND ${lt(checkouts.updatedAt,sql`clock_timestamp()-interval '5 minutes'`)}`).orderBy(checkouts.updatedAt).limit(3);
 for(const row of rows){if(performance.now()>=deadline)break;try{await reconcileCheckout(db,row.id,api);}catch{
  // Rotate failures out of the bounded oldest-first batch. Do not overwrite a
  // newer callback/worker timestamp that already made progress on this checkout.
  await db.update(checkouts).set({updatedAt:sql`clock_timestamp()`}).where(and(eq(checkouts.id,row.id),eq(checkouts.updatedAt,row.updatedAt)));
  console.warn(JSON.stringify({event:'billing.reconcile',outcome:'ATTENTION'}));
 }}
}
