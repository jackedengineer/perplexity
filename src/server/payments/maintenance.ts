import {inArray,lt,sql} from 'drizzle-orm';
import {billingCheckouts as checkouts} from '@/db/schema';
import type {JobDatabase} from '@/server/jobs/store';
import {createRazorpay} from './razorpay';
import {processBillingInbox,reconcileCheckout} from './billing';
export async function maintainBilling(db:JobDatabase){
 if(process.env.ENABLE_RAZORPAY_TEST_CHECKOUT!=='true')return;
 const api=createRazorpay({keyId:process.env.RAZORPAY_KEY_ID??'',keySecret:process.env.RAZORPAY_KEY_SECRET??''});
 const deadline=performance.now()+15000;await processBillingInbox(db,api,5,deadline);
 const rows=await db.select({id:checkouts.id}).from(checkouts).where(sql`${inArray(checkouts.state,['CREATING','UNKNOWN','READY','CANCELLED','COMPLETED'])} AND ${lt(checkouts.updatedAt,sql`clock_timestamp()-interval '5 minutes'`)}`).orderBy(checkouts.updatedAt).limit(3);
 for(const row of rows){if(performance.now()>=deadline)break;try{await reconcileCheckout(db,row.id,api);}catch{console.warn(JSON.stringify({event:'billing.reconcile',outcome:'ATTENTION'}));}}
}
