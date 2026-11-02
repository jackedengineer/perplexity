import {createHash,randomUUID} from 'node:crypto';
import {and,eq,gt,inArray,isNull,lte,or,sql} from 'drizzle-orm';
import {appUsers,durableJobs as jobs,jobPeriods as periods,jobReservations as reservations,jobSteps as steps,jobOutbox as outbox,jobEvents as events,operatorUsageBuckets as budgets,jobResearchInputs,jobCheckpoints} from '@/db/schema';
import {JobError,manifestFor,jobSubmission,type JobView,type JobEvent,type JobState} from './contracts';
import {SAFETY_RESPONSES} from '@/server/safety/responses';
import {presentAnswer} from '@/server/answers/presentation';
import {inspectInput} from '@/server/safety/deterministic';
import {researchModels,researchReport} from '@/server/deep-research/contracts';
import {readCheckpoint} from '@/server/deep-research/checkpoints';
import {appendEvent,databaseNow,ownerFor,type JobDatabase} from './store';
import type {JobEnvironment} from './configuration';
export async function admitJob(db:JobDatabase,subject:string,raw:unknown,budgetKey:string,models?:import('zod').infer<typeof researchModels>,environment:JobEnvironment='TEST'){
 const parsed=jobSubmission.safeParse(raw);if(!parsed.success||!budgetKey)throw new JobError('INVALID_INPUT');
 const input=parsed.data,manifest=manifestFor(input.workflow);
 if(environment==='LIVE'&&(input.workflow!=='deep-research-v1'||!budgetKey.startsWith('live-')))throw new JobError('INVALID_INPUT');
 if(input.workflow==='deep-research-v1'&&!models)throw new JobError('DISABLED');
 if(input.workflow==='deep-research-v1'){const blocked=inspectInput({text:input.question,context:[]});if(blocked)throw new JobError(blocked==='ACCIDENTAL_SECRET'?'REDACT_SECRET':'INPUT_BLOCKED');}
 // Preserve historical TEST intent hashes; LIVE intents cannot replay them.
 const intent=input.workflow==='deep-research-v1'?{version:input.version,workflow:input.workflow,question:input.question,locale:input.locale}:{version:input.version,workflow:input.workflow};
 const fingerprint=createHash('sha256').update(JSON.stringify(environment==='LIVE'?{environment,...intent}:intent)).digest('hex');
 return db.transaction(async tx=>{
  await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
  const owner=await ownerFor(tx,subject);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'job-admission:'+owner},0))`);
  const [prior]=await tx.select().from(jobs).where(and(eq(jobs.userId,owner),eq(jobs.requestId,input.requestId)));
  if(prior){if(prior.deletedAt)throw new JobError('NOT_FOUND');if(prior.fingerprint!==fingerprint)throw new JobError('CONFLICT');return prior.id;}
  if((await tx.select({id:jobs.id}).from(jobs).where(and(eq(jobs.userId,owner),inArray(jobs.state,['QUEUED','RUNNING']))).limit(1)).length)throw new JobError('CONFLICT');
  const now=await databaseNow(tx);
  const [period]=await tx.select().from(periods).where(and(eq(periods.userId,owner),eq(periods.environment,environment),eq(periods.state,'ACTIVE'),lte(periods.startsAt,now),gt(periods.endsAt,now)))
   .orderBy(periods.endsAt,periods.id).limit(1).for('update');
  if(!period)throw new JobError('PAYMENT_REQUIRED');
  if(period.reservedJobs+period.spentJobs>=period.jobLimit)throw new JobError('QUOTA');
  await tx.execute(sql`SELECT ensure_operator_day(${budgetKey})`);
  // Same ascending UUID operator lock order as FAST and the reviewed renewal function.
  const windows=await tx.select().from(budgets).where(and(eq(budgets.budgetKey,budgetKey),lte(budgets.startsAt,now),gt(budgets.endsAt,now))).orderBy(budgets.id).limit(3).for('update');
  const day=windows.find(w=>w.kind==='DAY'),month=windows.find(w=>w.kind==='PERIOD');
  const reserve=manifest.steps.reduce((n,s)=>n+s.capMicroUsd,0n);
  if(windows.length!==2||!day||!month)throw new JobError('UNAVAILABLE');
  if(windows.some(w=>w.providerLimitMicroUsd-w.reservedProviderMicroUsd-w.settledProviderMicroUsd<reserve))throw new JobError('QUOTA');
  await tx.update(periods).set({reservedJobs:sql`${periods.reservedJobs}+1`}).where(eq(periods.id,period.id));
  await tx.update(budgets).set({reservedProviderMicroUsd:sql`${budgets.reservedProviderMicroUsd}+${reserve}`}).where(inArray(budgets.id,windows.map(w=>w.id)));
  const [job]=await tx.insert(jobs).values({userId:owner,requestId:input.requestId,fingerprint,workflow:input.workflow,periodId:period.id,createdAt:now,deadlineAt:new Date(Math.min(now.getTime()+manifest.deadlineMs,period.endsAt.getTime(),...windows.map(w=>w.endsAt.getTime())))}).returning();
  await tx.insert(reservations).values({jobId:job.id,budgetKey,operatorPeriodId:month.id,operatorDayId:day.id,reservedMicroUsd:reserve});
  await tx.insert(steps).values(manifest.steps.map(s=>({jobId:job.id,...s})));
  if(input.workflow==='deep-research-v1')await tx.insert(jobResearchInputs).values({jobId:job.id,snapshot:{question:input.question,locale:input.locale,models:researchModels.parse(models),policy:'v1',version:'deep-research-v1'}});
  await tx.insert(outbox).values({jobId:job.id});await appendEvent(tx,job.id,'QUEUED');
  return job.id;
 });
}
export async function readJob(db:JobDatabase,subject:string,id:string):Promise<JobView>{
 const [row]=await db.select({job:jobs,reservation:reservations,question:sql<string|null>`${jobResearchInputs.snapshot}->>'question'`}).from(jobs).innerJoin(appUsers,eq(jobs.userId,appUsers.id))
  .innerJoin(reservations,eq(reservations.jobId,jobs.id)).leftJoin(jobResearchInputs,eq(jobResearchInputs.jobId,jobs.id)).where(and(eq(jobs.id,id),eq(appUsers.authSubject,subject),isNull(jobs.deletedAt))).limit(1);
 if(!row)throw new JobError('NOT_FOUND');const {job,reservation}=row;
 let notice:string|undefined;
 if(job.state==='FAILED'){const [failure]=await db.select({code:sql<string>`${jobCheckpoints.value}->>'notice'`}).from(jobCheckpoints).where(and(eq(jobCheckpoints.jobId,id),sql`${jobCheckpoints.value}->>'notice' IS NOT NULL`)).orderBy(sql`${jobCheckpoints.createdAt} DESC`).limit(1);notice=Object.values(SAFETY_RESPONSES).find(r=>r.code===failure?.code)?.text;}
 const privateReport=job.workflow==='deep-research-v1'&&job.state==='COMPLETED'?researchReport.parse(await readCheckpoint(db,id,'publish')):undefined;
 const report=privateReport?{question:privateReport.question,createdAt:privateReport.createdAt,sections:privateReport.sections.map(s=>({title:s.title,markdown:s.answer.markdown,answer:presentAnswer(s.answer)}))}:undefined;
 return {...(notice?{notice}:{}),...(row.question?{question:row.question}:{}),...(report?{report}:{}),id:job.id,workflow:job.workflow,state:job.state as JobState,createdAt:job.createdAt.toISOString(),deadlineAt:job.deadlineAt.toISOString(),cursor:job.nextEvent-1,heldMicroUsd:reservation.heldMicroUsd.toString(),spentMicroUsd:reservation.spentMicroUsd.toString()};
}
export async function listJobs(db:JobDatabase,subject:string){
 return db.select({id:jobs.id,state:jobs.state,createdAt:jobs.createdAt,workflow:jobs.workflow,question:sql<string|null>`${jobResearchInputs.snapshot}->>'question'`}).from(jobs).innerJoin(appUsers,eq(jobs.userId,appUsers.id))
  .leftJoin(jobResearchInputs,eq(jobResearchInputs.jobId,jobs.id)).where(and(eq(appUsers.authSubject,subject),isNull(jobs.deletedAt))).orderBy(sql`${jobs.createdAt} DESC`,jobs.id).limit(20);
}
export async function readEvents(db:JobDatabase,subject:string,id:string,after:number):Promise<JobEvent[]>{
 const [owned]=await db.select({id:jobs.id}).from(jobs).innerJoin(appUsers,eq(jobs.userId,appUsers.id)).where(and(eq(jobs.id,id),eq(appUsers.authSubject,subject),isNull(jobs.deletedAt))).limit(1);
 if(!owned)throw new JobError('NOT_FOUND');
 const rows=await db.select().from(events).where(and(eq(events.jobId,id),gt(events.sequence,after))).orderBy(events.sequence).limit(100);
 return rows.map(e=>({sequence:e.sequence,code:e.code as JobEvent['code'],step:e.step,createdAt:e.createdAt.toISOString()}));
}
export type DispatchClaim={jobId:string;revision:number;token:string;key:string};
export async function claimDispatch(db:JobDatabase,budgetKey?:string):Promise<DispatchClaim|null>{
 return db.transaction(async tx=>{
  const now=await databaseNow(tx);
  const [row]=await tx.select({outbox}).from(outbox).innerJoin(jobs,eq(jobs.id,outbox.jobId)).innerJoin(reservations,eq(reservations.jobId,jobs.id))
   .where(and(budgetKey?eq(reservations.budgetKey,budgetKey):undefined,inArray(jobs.state,['QUEUED','RUNNING']),gt(jobs.deadlineAt,now),lte(outbox.availableAt,now),sql`${outbox.attempts}<20`,or(eq(outbox.state,'PENDING'),and(eq(outbox.state,'DISPATCHING'),lte(outbox.leaseUntil,now)))))
   .orderBy(outbox.availableAt,outbox.jobId).limit(1).for('update',{of:outbox,skipLocked:true});
  if(!row)return null;const token=randomUUID(),o=row.outbox;
  await tx.update(outbox).set({state:'DISPATCHING',attempts:o.attempts+1,leaseToken:token,leaseUntil:new Date(now.getTime()+15000)}).where(eq(outbox.jobId,o.jobId));
  return {jobId:o.jobId,revision:o.revision,token,key:`job:${o.jobId}:dispatch:${o.revision}`};
 });
}
export async function finishDispatch(db:JobDatabase,claim:DispatchClaim,delivered:boolean){
 const result=await db.update(outbox).set({state:delivered?'DELIVERED':'PENDING',leaseUntil:null,leaseToken:null,availableAt:sql`clock_timestamp()+interval '5 seconds'`})
  .where(and(eq(outbox.jobId,claim.jobId),eq(outbox.revision,claim.revision),eq(outbox.leaseToken,claim.token),eq(outbox.state,'DISPATCHING'),gt(outbox.leaseUntil,sql`clock_timestamp()`))).returning({id:outbox.jobId});
 return result.length===1;
}
