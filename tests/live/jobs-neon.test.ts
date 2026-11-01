import {spawn,type ChildProcess} from 'node:child_process';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {and,eq,inArray} from 'drizzle-orm';
import {createNeonFixture,simultaneously} from './admission-fixture';
import {user,billingCheckouts,jobPeriods,durableJobs,jobOutbox,jobReservations,jobSteps,jobEvents} from '@/db/schema';
import {admitJob,readJob,readEvents} from '@/server/jobs/admission';
import {cancelJob,recoverJobs,claimJob} from '@/server/jobs/worker';
let f:ReturnType<typeof createNeonFixture>,subject:string,owner:string,period:string,child:ChildProcess|undefined;
const ids:string[]=[];
beforeAll(async()=>{
 f=createNeonFixture();await f.budgets(0n);const identity=await f.identity();subject=identity.subject;owner=identity.profile.id;
 await f.owner.update(user).set({emailVerified:true}).where(eq(user.id,subject));
 const subscription='sub_'+crypto.randomUUID().replaceAll('-','');
 await f.owner.insert(billingCheckouts).values({userId:owner,requestId:crypto.randomUUID(),planId:'plan_neonfixture',priceKey:'pro-monthly-inr-v1',environment:'TEST',state:'READY',subscriptionId:subscription});
 const [grant]=await f.owner.insert(jobPeriods).values({userId:owner,environment:'TEST',subscriptionId:subscription,paymentId:'pay_'+subscription.slice(4),invoiceId:'inv_'+subscription.slice(4),startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+3600000),jobLimit:10}).returning();period=grant.id;
});
afterAll(async()=>{
 await killWorker();if(!f)return;
 try{
  if(ids.length){await f.owner.delete(jobEvents).where(inArray(jobEvents.jobId,ids));await f.owner.delete(jobSteps).where(inArray(jobSteps.jobId,ids));await f.owner.delete(jobOutbox).where(inArray(jobOutbox.jobId,ids));await f.owner.delete(jobReservations).where(inArray(jobReservations.jobId,ids));await f.owner.delete(durableJobs).where(inArray(durableJobs.id,ids));}
  if(owner){await f.owner.delete(jobPeriods).where(eq(jobPeriods.userId,owner));await f.owner.delete(billingCheckouts).where(eq(billingCheckouts.userId,owner));}
 }finally{await f.close();}
});
const input=()=>({version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()});
async function admit(){const id=await admitJob(f.runtime,subject,input(),f.namespace);ids.push(id);return id;}
function startWorker(){
 child=spawn(process.execPath,['--import','tsx','scripts/jobs-worker.ts','--once'],{detached:true,stdio:'ignore',env:{...process.env,DATABASE_URL:process.env.DATABASE_URL,JOB_DATABASE_URL:process.env.DATABASE_URL,JOB_OPERATOR_BUDGET_KEY:f.namespace,ENABLE_DURABLE_JOB_SANDBOX:'true',ENABLE_RAZORPAY_TEST_CHECKOUT:'false'}});return child;
}
async function killWorker(){if(child?.pid&&child.exitCode===null&&child.signalCode===null){const processToStop=child;const closed=new Promise<void>(resolve=>processToStop.once('exit',()=>resolve()));process.kill(-child.pid,'SIGKILL');await closed;}child=undefined;}
async function until(check:()=>Promise<boolean>,timeout=40000){const end=Date.now()+timeout;do{if(await check())return;await new Promise(r=>setTimeout(r,500));}while(Date.now()<end);throw new Error('Durable test condition did not complete');}
it('serializes concurrent intents and reservations against actual restricted PostgreSQL connections',async()=>{
 const request=input();const results=await simultaneously([()=>admitJob(f.runtime,subject,request,f.namespace),()=>admitJob(f.runtime,subject,request,f.namespace)]);
 expect(results[0]).toBe(results[1]);ids.push(results[0]);expect((await f.owner.select().from(jobPeriods).where(eq(jobPeriods.id,period)))[0].reservedJobs).toBe(1);
 await expect(claimJob(f.runtime,results[0],'test-other-namespace')).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(readJob(f.runtime,'other-owner',results[0])).rejects.toMatchObject({code:'NOT_FOUND'});
 await cancelJob(f.runtime,subject,results[0]);
},90000);
it('resumes committed checkpoints after an actual worker-process crash without repeating completed steps',async()=>{
 const id=await admit();startWorker();
 await until(async()=> (await readEvents(f.runtime,subject,id,0)).some(e=>e.code==='STEP_COMPLETED'&&e.step==='checkpoint'));
 await killWorker();
 await until(async()=> (await recoverJobs(f.runtime,20,f.namespace))===1,25000);
 startWorker();await until(async()=> (await readJob(f.runtime,subject,id)).state==='COMPLETED');await killWorker();
 const events=await readEvents(f.runtime,subject,id,0);
 expect(events.filter(e=>e.code==='STEP_COMPLETED'&&e.step==='checkpoint')).toHaveLength(1);
 expect(events.some(e=>e.code==='RECOVERED')).toBe(true);
 expect((await f.owner.select().from(jobReservations).where(eq(jobReservations.jobId,id)))[0]).toMatchObject({heldMicroUsd:0n,spentMicroUsd:0n});
},90000);
it('durably stops the separate worker and emits no late completion',async()=>{
 const id=await admit();startWorker();await until(async()=> (await readEvents(f.runtime,subject,id,0)).some(e=>e.code==='STEP_STARTED'));
 await cancelJob(f.runtime,subject,id);await until(async()=>child?.exitCode!==null||child?.signalCode!==null);
 expect((await readJob(f.runtime,subject,id)).state).toBe('CANCELLED');
 expect((await readEvents(f.runtime,subject,id,0)).some(e=>e.code==='COMPLETED')).toBe(false);
 expect((await f.owner.select().from(jobPeriods).where(and(eq(jobPeriods.id,period),eq(jobPeriods.reservedJobs,0))))).toHaveLength(1);
},90000);
