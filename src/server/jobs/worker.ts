import {and,eq,gt,inArray,lte,or,sql} from 'drizzle-orm';
import {durableJobs as jobs,jobPeriods as periods,jobSteps as steps,jobReservations as reservations,jobOutbox as outbox,operatorUsageBuckets as budgets,appUsers,jobCheckpoints} from '@/db/schema';
import {JobError,activeJob,manifestFor,type JobState} from './contracts';
import {checkpointHash} from '@/server/deep-research/checkpoints';
import {appendEvent,databaseNow,lockJob,type JobDatabase,type JobTransaction} from './store';
import type {JobEnvironment} from './configuration';
export type JobLease={jobId:string;generation:number};
type Job=typeof jobs.$inferSelect;
async function validateLease(tx:JobTransaction,lease:JobLease){
 const job=await lockJob(tx,lease.jobId),now=await databaseNow(tx);
 if(job.state!=='RUNNING'||job.generation!==lease.generation||!job.leaseUntil||job.leaseUntil<=now||job.deadlineAt<=now)throw new JobError('STALE');
 const [period]=await tx.select().from(periods).where(eq(periods.id,job.periodId)).for('share');
 if(!period||period.state!=='ACTIVE'||period.endsAt<=now)throw new JobError('STALE');
 return {job,now};
}
async function settle(tx:JobTransaction,job:Job,state:JobState){
 if(!activeJob(job.state))return;
 const [period]=await tx.select().from(periods).where(eq(periods.id,job.periodId)).for('update');
 const now=await databaseNow(tx),all=await tx.select().from(steps).where(eq(steps.jobId,job.id));
 let spent=0n,held=0n;
 for(const step of all){
  if(step.state==='SUCCEEDED')spent+=step.costMicroUsd!;
  if(step.state==='UNKNOWN'||step.state==='STARTED')held+=step.capMicroUsd;
 }
 const [reservation]=await tx.select().from(reservations).where(eq(reservations.jobId,job.id)).for('update');
 if(!reservation||reservation.settledAt||spent+held>reservation.reservedMicroUsd)throw new JobError('UNAVAILABLE');
 // Lock shared money rows in exactly the FAST/renewal order. Financial receipts
 // and terminal state commit together, so duplicate completion cannot debit twice.
 const ids=[reservation.operatorPeriodId,reservation.operatorDayId];
 await tx.select({id:budgets.id}).from(budgets).where(inArray(budgets.id,ids)).orderBy(budgets.id).for('update');
 await tx.update(budgets).set({reservedProviderMicroUsd:sql`${budgets.reservedProviderMicroUsd}-${reservation.reservedMicroUsd}+${held}`,
  settledProviderMicroUsd:sql`${budgets.settledProviderMicroUsd}+${spent}`}).where(inArray(budgets.id,ids));
 await tx.update(reservations).set({spentMicroUsd:spent,heldMicroUsd:held,settledAt:now}).where(eq(reservations.jobId,job.id));
 await tx.update(steps).set({state:'UNKNOWN',finishedAt:now}).where(and(eq(steps.jobId,job.id),eq(steps.state,'STARTED')));
 await tx.update(steps).set({state:'SKIPPED',finishedAt:now}).where(and(eq(steps.jobId,job.id),eq(steps.state,'PENDING')));
 // LIVE sells completed reports. Failed/stopped attempts retain their actual
 // provider spend and unknown holds above, without consuming a report credit.
 const charged=state==='COMPLETED'||period.environment==='TEST'&&all.some(s=>s.startedAt!==null||s.state==='STARTED'||s.state==='UNKNOWN');
 await tx.update(periods).set({reservedJobs:sql`${periods.reservedJobs}-1`,spentJobs:sql`${periods.spentJobs}+${charged?1:0}`}).where(eq(periods.id,job.periodId));
 const finished=await tx.update(jobs).set({state,generation:job.generation+1,leaseUntil:null,updatedAt:now})
  .where(and(eq(jobs.id,job.id),state==='COMPLETED'?and(gt(jobs.deadlineAt,sql`clock_timestamp()`),gt(jobs.leaseUntil,sql`clock_timestamp()`)):undefined)).returning({id:jobs.id});
 if(!finished.length)throw new JobError('STALE');
 await tx.update(outbox).set({state:'DELIVERED',leaseUntil:null,leaseToken:null}).where(eq(outbox.jobId,job.id));
 if(held>0n)await appendEvent(tx,job.id,'COST_UNKNOWN');
 await appendEvent(tx,job.id,state==='COMPLETED'?'COMPLETED':state==='CANCELLED'?'CANCELLED':state==='EXPIRED'?'EXPIRED':'FAILED');
}
export async function claimJob(db:JobDatabase,id:string,budgetKey?:string,environment:JobEnvironment='TEST'):Promise<JobLease|null>{
 return db.transaction(async tx=>{
  const job=await lockJob(tx,id),now=await databaseNow(tx);
  if(budgetKey&&!(await tx.select().from(reservations).where(and(eq(reservations.jobId,id),eq(reservations.budgetKey,budgetKey)))).length)throw new JobError('NOT_FOUND');
  if(job.state!=='QUEUED')return null;
  const [period]=await tx.select().from(periods).where(eq(periods.id,job.periodId)).for('share');
  if(period&&period.environment!==environment)throw new JobError('NOT_FOUND');
  if(job.deadlineAt<=now||!period||period.state!=='ACTIVE'||period.endsAt<=now){await settle(tx,job,job.deadlineAt<=now?'EXPIRED':'CANCELLED');return null;}
  const generation=job.generation+1;
  await tx.update(jobs).set({state:'RUNNING',generation,leaseUntil:new Date(now.getTime()+manifestFor(job.workflow).leaseMs),updatedAt:now}).where(eq(jobs.id,id));
  await appendEvent(tx,id,'RUNNING');return {jobId:id,generation};
 });
}
export async function heartbeat(db:JobDatabase,lease:JobLease){
 return db.transaction(async tx=>{
  const {now,job}=await validateLease(tx,lease);
  await tx.update(jobs).set({leaseUntil:new Date(now.getTime()+manifestFor(job.workflow).leaseMs),updatedAt:now}).where(eq(jobs.id,lease.jobId));
 });
}
export async function startStep(db:JobDatabase,lease:JobLease,key:string){
 return db.transaction(async tx=>{
  const {now,job}=await validateLease(tx,lease);
  const [step]=await tx.select().from(steps).where(and(eq(steps.jobId,lease.jobId),eq(steps.key,key)));
  const manifest=manifestFor(job.workflow).steps.find(s=>s.key===key);
  if(!step||!manifest||step.capMicroUsd!==manifest.capMicroUsd||step.kind!==manifest.kind)throw new JobError('INVALID_INPUT');
  if(step.state==='SUCCEEDED')return 'DONE' as const;
  if(step.state!=='PENDING')throw new JobError('STALE');
  // Fixed order: later executors cannot skip their prerequisite checkpoints.
  const all=manifestFor(job.workflow).steps;
  const prior=all.slice(0,all.findIndex(s=>s.key===key)).map(s=>s.key);
  if(prior.length&&(await tx.select().from(steps).where(and(eq(steps.jobId,lease.jobId),inArray(steps.key,prior),sql`${steps.state}<>'SUCCEEDED'`))).length)throw new JobError('CONFLICT');
  await tx.update(steps).set({state:'STARTED',generation:lease.generation,startedAt:now}).where(and(eq(steps.jobId,lease.jobId),eq(steps.key,key)));
  await appendEvent(tx,lease.jobId,'STEP_STARTED',key);return 'START' as const;
 });
}
export async function completeStep(db:JobDatabase,lease:JobLease,key:string,cost:bigint,value?:unknown,stop=false){
 return db.transaction(async tx=>{
  const {now,job}=await validateLease(tx,lease);
  const [step]=await tx.select().from(steps).where(and(eq(steps.jobId,lease.jobId),eq(steps.key,key)));
  if(!step||step.generation!==lease.generation||cost<0n||cost>step.capMicroUsd)throw new JobError('STALE');
  if(step.state==='SUCCEEDED'){if(step.costMicroUsd!==cost)throw new JobError('CONFLICT');return;}
  if(step.state!=='STARTED')throw new JobError('STALE');
  if(value!==undefined)await tx.insert(jobCheckpoints).values({jobId:lease.jobId,step:key,value,hash:checkpointHash(value)});
  await tx.update(steps).set({state:'SUCCEEDED',costMicroUsd:cost,finishedAt:now}).where(and(eq(steps.jobId,lease.jobId),eq(steps.key,key)));
  await appendEvent(tx,lease.jobId,'STEP_COMPLETED',key);
  // A denial checkpoint must never become replayable independently of failure.
  if(stop)await settle(tx,job,'FAILED');
 });
}
export async function completeJob(db:JobDatabase,lease:JobLease){
 return db.transaction(async tx=>{
  const job=await lockJob(tx,lease.jobId);if(job.state==='COMPLETED')return;
  await validateLease(tx,lease);
  const all=await tx.select().from(steps).where(eq(steps.jobId,job.id));
  const manifest=manifestFor(job.workflow);
  if(all.length!==manifest.steps.length||all.some(s=>s.state!=='SUCCEEDED'||!manifest.steps.some(m=>m.key===s.key&&m.kind===s.kind&&m.capMicroUsd===s.capMicroUsd)))throw new JobError('CONFLICT');
  await settle(tx,job,'COMPLETED');
 });
}
export async function cancelJob(db:JobDatabase,subject:string,id:string){
 return db.transaction(async tx=>{
  const [owned]=await tx.select({id:jobs.id}).from(jobs).innerJoin(appUsers,eq(jobs.userId,appUsers.id)).where(and(eq(jobs.id,id),eq(appUsers.authSubject,subject)));
  if(!owned)throw new JobError('NOT_FOUND');
  const job=await lockJob(tx,id);await settle(tx,job,'CANCELLED');
 });
}
export async function recoverJobs(db:JobDatabase,limit=20,budgetKey?:string){
 // Discovery is bounded; each row gets its own short transaction and recheck.
 const candidates=await db.select({id:jobs.id}).from(jobs).innerJoin(periods,eq(periods.id,jobs.periodId)).innerJoin(outbox,eq(outbox.jobId,jobs.id)).innerJoin(reservations,eq(reservations.jobId,jobs.id))
  .where(and(budgetKey?eq(reservations.budgetKey,budgetKey):undefined,inArray(jobs.state,['QUEUED','RUNNING']),or(and(eq(jobs.state,'QUEUED'),eq(outbox.state,'DELIVERED'),lte(outbox.availableAt,sql`clock_timestamp()-interval '30 seconds'`)),lte(jobs.deadlineAt,sql`clock_timestamp()`),lte(jobs.leaseUntil,sql`clock_timestamp()`),eq(periods.state,'REVOKED'),lte(periods.endsAt,sql`clock_timestamp()`))))
  .orderBy(jobs.deadlineAt,jobs.id).limit(Math.min(100,Math.max(1,limit)));
 let recovered=0;
 for(const {id} of candidates)await db.transaction(async tx=>{
  const job=await lockJob(tx,id),now=await databaseNow(tx);if(!activeJob(job.state))return;
  const [period]=await tx.select().from(periods).where(eq(periods.id,job.periodId)).for('share');
  if(job.deadlineAt<=now){await settle(tx,job,'EXPIRED');recovered++;return;}
  if(!period||period.state!=='ACTIVE'||period.endsAt<=now){await settle(tx,job,'CANCELLED');recovered++;return;}
  if(job.state==='QUEUED'){
   const [dispatch]=await tx.select().from(outbox).where(eq(outbox.jobId,id)).for('update');
   if(dispatch.state!=='DELIVERED'||dispatch.availableAt.getTime()>now.getTime()-30000)return;
   await tx.update(outbox).set({state:'PENDING',revision:dispatch.revision+1,attempts:0,leaseUntil:null,leaseToken:null,availableAt:now}).where(eq(outbox.jobId,id));
   await appendEvent(tx,id,'RECOVERED');recovered++;return;
  }
  if(job.state!=='RUNNING'||!job.leaseUntil||job.leaseUntil>now)return;
  const started=await tx.select().from(steps).where(and(eq(steps.jobId,id),eq(steps.state,'STARTED')));
  if(started.some(s=>s.capMicroUsd>0n||s.kind!=='SYSTEM')){await settle(tx,job,'FAILED');recovered++;return;}
  // Only explicitly non-billable, idempotent SYSTEM checkpoints can restart.
  await tx.update(steps).set({state:'PENDING',generation:null,startedAt:null}).where(and(eq(steps.jobId,id),eq(steps.state,'STARTED'),eq(steps.kind,'SYSTEM'),eq(steps.capMicroUsd,0n)));
  await tx.update(jobs).set({state:'QUEUED',generation:job.generation+1,leaseUntil:null,updatedAt:now}).where(eq(jobs.id,id));
  await tx.update(outbox).set({state:'PENDING',revision:sql`${outbox.revision}+1`,attempts:0,leaseUntil:null,leaseToken:null,availableAt:now}).where(eq(outbox.jobId,id));
  await appendEvent(tx,id,'RECOVERED');recovered++;
 });
 return recovered;
}

export async function failJob(db:JobDatabase,lease:JobLease){return db.transaction(async tx=>{const {job}=await validateLease(tx,lease);await settle(tx,job,'FAILED');});}
