import {z} from 'zod';
import {JobError} from '@/server/jobs/contracts';
import {createRazorpay,planId} from './razorpay';
export function paymentConfiguration(env:Record<string,string|undefined>=process.env){
 if(env.ENABLE_RAZORPAY_TEST_CHECKOUT!=='true'||env.VERCEL_ENV==='production')throw new JobError('DISABLED');
 const keys=z.object({RAZORPAY_KEY_ID:z.string().regex(/^rzp_test_[A-Za-z0-9]+$/u),RAZORPAY_KEY_SECRET:z.string().min(16),RAZORPAY_PRO_PLAN_ID:planId,RAZORPAY_WEBHOOK_SECRET:z.string().min(32)}).safeParse(env);
 if(!keys.success)throw new JobError('DISABLED');return {api:createRazorpay({keyId:keys.data.RAZORPAY_KEY_ID,keySecret:keys.data.RAZORPAY_KEY_SECRET}),planId:keys.data.RAZORPAY_PRO_PLAN_ID,keySecret:keys.data.RAZORPAY_KEY_SECRET,webhookSecret:keys.data.RAZORPAY_WEBHOOK_SECRET};
}
