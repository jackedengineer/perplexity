import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';
import {configure,runs,tasks} from '@trigger.dev/sdk';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {eq,inArray} from 'drizzle-orm';
import {createNeonFixture} from './admission-fixture';
import {user,billingCheckouts,jobPeriods,durableJobs,jobOutbox,jobReservations,jobSteps,jobEvents,operatorUsageBuckets} from '@/db/schema';
import {admitJob,readJob,readEvents} from '@/server/jobs/admission';
import {cancelJob} from '@/server/jobs/worker';

// No local consumer/dispatcher runs in this suite. All execution and recovery
// commands go to the explicitly approved hosted TEST worker environment.
const hosted=parse(readFileSync('.env.jobs.hosted.local'));
if(process.env.LIVE_HOSTED_JOB_CHECKS!=='1'||!hosted.TRIGGER_SECRET_KEY?.startsWith('tr_prod_sk_')||
 !/^test-hosted-[a-f0-9-]{36}$/u.test(hosted.JOB_OPERATOR_BUDGET_KEY??'')||
 new URL(hosted.DATABASE_URL).hostname!=='ep-sweet-night-az8bacv2-pooler.c-3.ap-southeast-1.aws.neon.tech')throw new Error('Explicit isolated hosted sandbox required');
configure({accessToken:hosted.TRIGGER_SECRET_KEY});
const namespace=hosted.JOB_OPERATOR_BUDGET_KEY;
let f:ReturnType<typeof createNeonFixture>,subject:string,owner:string,namespaceCreated=false;
const ids:string[]=[],remoteIds=new Set<string>();
beforeAll(async()=>{
 f=createNeonFixture();
 if((await f.owner.select({id:operatorUsageBuckets.id}).from(operatorUsageBuckets).where(eq(operatorUsageBuckets.budgetKey,namespace))).length)throw new Error('Hosted verification needs a fresh namespace; existing ledger retained');
 const identity=await f.identity();subject=identity.subject;owner=identity.profile.id;
 await f.owner.update(user).set({emailVerified:true}).where(eq(user.id,subject));
 await f.owner.insert(operatorUsageBuckets).values((['DAY','PERIOD'] as const).map(kind=>({budgetKey:namespace,kind,
  startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+7200000),providerLimitMicroUsd:0n})));namespaceCreated=true;
 const suffix=crypto.randomUUID().replaceAll('-',''),subscription='sub_'+suffix;
 await f.owner.insert(billingCheckouts).values({userId:owner,requestId:crypto.randomUUID(),planId:'plan_hostedfixture',priceKey:'pro-monthly-inr-v1',environment:'TEST',subscriptionId:subscription,state:'READY'});
 await f.owner.insert(jobPeriods).values({userId:owner,environment:'TEST',paymentId:'pay_'+suffix,invoiceId:'inv_'+suffix,subscriptionId:subscription,
  startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+3600000),jobLimit:10});
});
async function until(check:()=>Promise<boolean>,timeout=60000){
 const end=Date.now()+timeout;do{if(await check())return;await new Promise(resolve=>setTimeout(resolve,500));}while(Date.now()<end);
 throw new Error('Hosted condition did not complete');
}
async function maintain(){
 const handle=await tasks.trigger('maintain-jobs-v1',{}, {idempotencyKey:'hosted-check:'+crypto.randomUUID(),maxAttempts:1});remoteIds.add(handle.id);
 await until(async()=>{const run=await runs.retrieve(handle.id);if(run.isFailed||run.isCancelled)throw new Error('Hosted maintenance failed');return run.isSuccess;});
}
async function admit(){const id=await admitJob(f.runtime,subject,{version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()},namespace);ids.push(id);return id;}
async function activeRemote(id:string){
 for await(const item of runs.list({taskIdentifier:['execute-job-v1'],period:'1h',limit:20})){
  if(!item.isExecuting)continue;const run=await runs.retrieve(item.id);
  if((run.payload as {jobId?:string})?.jobId===id){remoteIds.add(run.id);return run.id;}
 }
 throw new Error('No matching hosted execution');
}
afterAll(async()=>{
 if(!f)return;
 try{
  for(const id of ids)await cancelJob(f.runtime,subject,id);
  for(const id of remoteIds){const run=await runs.retrieve(id);if(!run.isCompleted)await runs.cancel(id);}
  if(ids.length){
   await f.owner.delete(jobEvents).where(inArray(jobEvents.jobId,ids));await f.owner.delete(jobSteps).where(inArray(jobSteps.jobId,ids));
   await f.owner.delete(jobOutbox).where(inArray(jobOutbox.jobId,ids));await f.owner.delete(jobReservations).where(inArray(jobReservations.jobId,ids));
   await f.owner.delete(durableJobs).where(inArray(durableJobs.id,ids));
  }
  if(owner){await f.owner.delete(jobPeriods).where(eq(jobPeriods.userId,owner));await f.owner.delete(billingCheckouts).where(eq(billingCheckouts.userId,owner));}
  if(namespaceCreated)await f.owner.delete(operatorUsageBuckets).where(eq(operatorUsageBuckets.budgetKey,namespace));
 }finally{await f.close();}
});
it('dispatches to hosted compute and persists each checkpoint once',async()=>{
 const id=await admit();await maintain();await until(async()=>(await readJob(f.runtime,subject,id)).state==='COMPLETED');
 const events=await readEvents(f.runtime,subject,id,0);expect(events.filter(e=>e.code==='STEP_COMPLETED')).toHaveLength(3);
 expect((await f.owner.select().from(jobReservations).where(eq(jobReservations.jobId,id)))[0]).toMatchObject({heldMicroUsd:0n,spentMicroUsd:0n});
},90000);
it('recovers a terminated cloud run without replaying a committed checkpoint',async()=>{
 const id=await admit();await maintain();await until(async()=>(await readEvents(f.runtime,subject,id,0)).some(e=>e.code==='STEP_COMPLETED'&&e.step==='checkpoint'));
 const run=await activeRemote(id);
 // The recovery command is queued before termination. No local process invokes
 // recovery after the crash; Trigger's durable delayed delivery does so.
 const watchdog=await tasks.trigger('maintain-jobs-v1',{}, {delay:'25s',idempotencyKey:'hosted-recovery:'+id,maxAttempts:1});remoteIds.add(watchdog.id);
 await runs.cancel(run);
 await until(async()=>(await readJob(f.runtime,subject,id)).state==='COMPLETED',90000);
 expect((await runs.retrieve(watchdog.id)).isSuccess).toBe(true);
 const events=await readEvents(f.runtime,subject,id,0);expect(events.some(e=>e.code==='RECOVERED')).toBe(true);
 expect(events.filter(e=>e.code==='STEP_COMPLETED'&&e.step==='checkpoint')).toHaveLength(1);
},120000);
it('fences a hosted worker after persisted owner cancellation',async()=>{
 const id=await admit();await maintain();await until(async()=>(await readEvents(f.runtime,subject,id,0)).some(e=>e.code==='STEP_STARTED'));
 const remote=await activeRemote(id);await cancelJob(f.runtime,subject,id);
 await until(async()=>(await runs.retrieve(remote)).isCompleted);
 expect((await readJob(f.runtime,subject,id)).state).toBe('CANCELLED');
 expect((await readEvents(f.runtime,subject,id,0)).some(e=>e.code==='COMPLETED')).toBe(false);
});
