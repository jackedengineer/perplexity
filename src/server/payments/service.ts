import {paymentConfiguration} from './config';
import 'server-only';
import {z} from 'zod';
import {after} from 'next/server';
import {getDb} from '@/db';
import {getCurrentSession} from '@/lib/current-session';
import {getServerEnv} from '@/lib/env';
import {jobsEnabled} from '@/server/jobs/service';
import {sandboxDatabaseUrl} from '@/server/jobs/connection';
import {privateHeaders,jobFailure,readBoundedBody,readBoundedBytes,sameOrigin} from '@/server/jobs/http';
import {JobError} from '@/server/jobs/contracts';
import {AdmissionError} from '@/server/runs/errors';
import {createRequestLimiter} from '@/server/runs/rate-limit';
import {requireEmptyBody} from '@/server/runs/recovery-http';
import {checkoutInput,confirmationInput} from './razorpay';
import {startCheckout,confirmCheckout,cancelSubscription,billingStatus,ingestWebhook,processBillingInbox} from './billing';
import {assertPilotCapacity} from './pilot';
export function billingEnabled(){try{
 const c=paymentConfiguration();
 // Pause admissions independently of billing reads/cancellation/reconciliation.
 if(c.mode==='TEST')sandboxDatabaseUrl({...process.env,ENABLE_DURABLE_JOB_SANDBOX:'true',JOB_DATABASE_URL:undefined});
 return true;
}catch{return false;}}
export function purchasesEnabled(){try{return paymentConfiguration().purchasesEnabled&&jobsEnabled();}catch{return false;}}
export async function currentBillingStatus(subject:string){
 const c=paymentConfiguration();let enabled=purchasesEnabled();
 const status=await billingStatus(getDb(),subject,c.mode);
 // An owned READY intent can resume its existing seat, without creating a
 // second subscription. Other owners only see purchases paused.
 const resumable=status.checkouts.find(row=>row.state==='READY'&&row.subscriptionId)?.id;
 if(enabled&&c.mode==='LIVE'){try{await getDb().transaction(tx=>assertPilotCapacity(tx,c.pilot!,resumable));}catch{enabled=false;}}
 return {...status,purchasesEnabled:enabled};
}
async function identity(){
 if(!billingEnabled())throw new JobError('DISABLED');const session=await getCurrentSession();if(!session||session.user.isAnonymous||!session.user.emailVerified)throw new AdmissionError('UNAUTHENTICATED');
 await createRequestLimiter(getDb(),'billing-http-v1',{userMinute:20,userDay:200,anonymousMinute:1,anonymousDay:1}).consume('billing:'+session.user.id);return session.user.id;
}
async function respond(work:()=>Promise<Response>){try{return await work();}catch(error){
 if(error instanceof JobError&&error.code==='CONFLICT')return Response.json({error:{code:'CONFLICT',message:'A subscription request already exists. Continue it below or wait for verification.'}},{status:409,headers:privateHeaders});
 return jobFailure(error instanceof z.ZodError||error instanceof SyntaxError?new JobError('INVALID_INPUT'):error);
}}
export const paymentsHttp={
 status:()=>respond(async()=>Response.json(await currentBillingStatus(await identity()),{headers:privateHeaders})),
 checkout:(request:Request)=>respond(async()=>{
  const subject=await identity();sameOrigin(request,getServerEnv().BETTER_AUTH_URL);if(!purchasesEnabled())throw new JobError('DISABLED');const input=checkoutInput.parse(JSON.parse(await readBoundedBody(request)));const c=paymentConfiguration();
  return Response.json(await startCheckout(getDb(),subject,input,c.planId,c.api,c.pilot),{status:202,headers:privateHeaders});
 }),
 confirm:(request:Request)=>respond(async()=>{
  const subject=await identity();sameOrigin(request,getServerEnv().BETTER_AUTH_URL);const input=confirmationInput.parse(JSON.parse(await readBoundedBody(request)));const c=paymentConfiguration();
  await confirmCheckout(getDb(),subject,input,c.keySecret,c.api);return Response.json(await currentBillingStatus(subject),{headers:privateHeaders});
 }),
 cancel:(request:Request,id:string)=>respond(async()=>{
  const subject=await identity();sameOrigin(request,getServerEnv().BETTER_AUTH_URL);if(!z.uuid().safeParse(id).success)throw new JobError('INVALID_INPUT');await requireEmptyBody(request);
  await cancelSubscription(getDb(),subject,id,paymentConfiguration().api);return Response.json(await currentBillingStatus(subject),{headers:privateHeaders});
 }),
 webhook:(request:Request)=>respond(async()=>{
  if(!billingEnabled())throw new JobError('DISABLED');if(request.method!=='POST'||new URL(request.url).search)throw new JobError('INVALID_INPUT');const c=paymentConfiguration();
  const raw=await readBoundedBytes(request,65536);
  await ingestWebhook(getDb(),request.headers.get('x-razorpay-event-id')??'',raw,request.headers.get('x-razorpay-signature')??'',c.webhookSecret,c.mode);
  // Acceleration only: the durable inbox is also drained by worker maintenance.
  after(async()=>{try{await processBillingInbox(getDb(),c.api,1);}catch{console.warn(JSON.stringify({event:'billing.inbox',outcome:'PENDING'}));}});
  return Response.json({accepted:true},{status:202,headers:privateHeaders});
 }),
};
