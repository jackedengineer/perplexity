import {z} from 'zod';
import {JobError} from '@/server/jobs/contracts';
import {createRazorpay,planId} from './razorpay';
import {paymentMode} from './offer';
import {cloudflareProductionDatabase} from '@/server/jobs/configuration';
import {livePilotConfiguration} from './pilot';
export function paymentConfiguration(env:Record<string,string|undefined>=process.env){
 const keys=z.object({RAZORPAY_KEY_ID:z.string(),RAZORPAY_KEY_SECRET:z.string().min(16),RAZORPAY_PRO_PLAN_ID:planId,RAZORPAY_WEBHOOK_SECRET:z.string().min(32)}).safeParse(env);
 if(!keys.success)throw new JobError('DISABLED');
 const mode=paymentMode(keys.data.RAZORPAY_KEY_ID);
 if(mode==='TEST'){
  if(env.ENABLE_RAZORPAY_TEST_CHECKOUT!=='true'||env.ENABLE_RAZORPAY_LIVE_BILLING==='true'||env.VERCEL_ENV==='production')throw new JobError('DISABLED');
 }else{
  if(env.ENABLE_RAZORPAY_LIVE_BILLING!=='true'||env.ENABLE_RAZORPAY_TEST_CHECKOUT==='true'||env.JOB_DATABASE_URL!==undefined)throw new JobError('DISABLED');
  if(env.DEPLOYMENT_PLATFORM==='cloudflare'){
   try{cloudflareProductionDatabase(env);}catch{throw new JobError('DISABLED');}
  }else if(env.VERCEL_ENV!=='production'||env.BETTER_AUTH_URL!=='https://perplexity-gold-alpha.vercel.app')throw new JobError('DISABLED');
  let url:URL;try{url=new URL(env.DATABASE_URL??'');}catch{throw new JobError('DISABLED');}
  if(!['postgresql:','postgres:'].includes(url.protocol)||url.hostname!=='ep-small-bread-b3we4v54-pooler.c-4.ap-southeast-1.aws.neon.tech'||url.username!=='perplex_web'||!url.password||url.pathname!=='/perplex'||url.port&&url.port!=='5432'||url.searchParams.get('sslmode')!=='verify-full')throw new JobError('DISABLED');
 }
 // Billing reads, cancellation and signed recovery remain available with purchases paused.
 // Live purchases require a separate fulfillment readiness check in the HTTP service.
 let pilot;try{if(mode==='LIVE')pilot=livePilotConfiguration(env);}catch{/* Recovery remains enabled when new purchases are paused. */}
 return {mode,purchasesEnabled:mode==='TEST'||!!pilot,pilot,api:createRazorpay({keyId:keys.data.RAZORPAY_KEY_ID,keySecret:keys.data.RAZORPAY_KEY_SECRET,allowLive:mode==='LIVE'}),planId:keys.data.RAZORPAY_PRO_PLAN_ID,keySecret:keys.data.RAZORPAY_KEY_SECRET,webhookSecret:keys.data.RAZORPAY_WEBHOOK_SECRET};
}
