import {readFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {z} from 'zod';
import {createRazorpay,planId} from '../src/server/payments/razorpay';

// Read-only credential/plan verification. Never creates a subscription or payment.
// Supply an ignored file explicitly; do not inherit TEST keys or default env files.
async function main(){
 const file=process.env.BILLING_ENV_FILE;
 if(!file)throw new Error('Explicit billing environment file required');
 const env=z.object({RAZORPAY_KEY_ID:z.string().regex(/^rzp_live_[A-Za-z0-9]+$/u),RAZORPAY_KEY_SECRET:z.string().min(16),RAZORPAY_PRO_PLAN_ID:planId}).parse(parse(await readFile(file,'utf8')));
 const api=createRazorpay({keyId:env.RAZORPAY_KEY_ID,keySecret:env.RAZORPAY_KEY_SECRET,allowLive:true});
 const plan=await api.plan(env.RAZORPAY_PRO_PLAN_ID);
 if(plan.id!==env.RAZORPAY_PRO_PLAN_ID)throw new Error('Unexpected plan');
 console.info(JSON.stringify({event:'billing.readonly_verification',outcome:'PASSED',mode:'LIVE',period:plan.period,interval:plan.interval,amountPaise:plan.item.amount,currency:plan.item.currency,subscriptionsCreated:0}));
}
main().catch(()=>{console.error('Live billing read-only verification failed. Check the explicit ignored configuration and provider availability; no mutation was attempted.');process.exitCode=1;});
