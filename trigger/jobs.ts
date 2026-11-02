import {maintainBilling} from '../src/server/payments/maintenance';
import {task,schedules,tasks} from '@trigger.dev/sdk';
import {z} from 'zod';
import {eq,and} from 'drizzle-orm';
import {durableJobs,jobReservations} from '../src/db/schema';
import {workerDatabase,workerBudgetKey} from '../src/server/jobs/connection';
import {consumeJob} from '../src/server/jobs/consumer';
import {automaticDispatch} from '../src/server/jobs/transport';
import {jobConfiguration} from '../src/server/jobs/configuration';
import {recordJobMaintenance,recoverWorkerServices} from '../src/server/jobs/maintenance';
import {paymentConfiguration} from '../src/server/payments/config';
import {configuredResearchModels} from '../src/server/deep-research/configuration';
import {pruneJobEvidence} from '../src/server/jobs/privacy';
const payload=z.strictObject({jobId:z.uuid()});
export const executeJob=task({id:'execute-job-v1',maxDuration:900,retry:{maxAttempts:1},queue:{name:'durable-jobs-v1',concurrencyLimit:1},
 run:async(raw:unknown)=>{return consumeJob(workerDatabase(),payload.parse(raw).jobId,{budgetKey:workerBudgetKey(),environment:jobConfiguration().mode});}});
export const watchJob=task({id:'watch-job-v1',maxDuration:30,retry:{maxAttempts:1},queue:{name:'job-watch-v1',concurrencyLimit:1},
 run:async(raw:unknown)=>{
  const {jobId}=payload.parse(raw),db=workerDatabase(),key=workerBudgetKey();
  const [job]=await db.select({state:durableJobs.state,deadlineAt:durableJobs.deadlineAt,generation:durableJobs.generation}).from(durableJobs)
   .innerJoin(jobReservations,eq(durableJobs.id,jobReservations.jobId)).where(and(eq(durableJobs.id,jobId),eq(jobReservations.budgetKey,key)));
  if(!job||!['QUEUED','RUNNING'].includes(job.state))return;
  // Queue the successor before doing recovery, so losing this process cannot
  // also lose an already-acknowledged watch chain. The absolute deadline bounds it.
  if(job.deadlineAt.getTime()>Date.now())await tasks.trigger('watch-job-v1',{jobId},{delay:'45s',idempotencyKey:`watch:${jobId}:${Math.floor(Date.now()/40000)}`,idempotencyKeyTTL:'24h',maxAttempts:1},{retry:{maxAttempts:1}});
  return automaticDispatch(db,key);
 }});
export const maintainJobs=schedules.task({id:'maintain-jobs-v1',
 ...(process.env.ENABLE_JOB_SCHEDULE==='true'?{cron:{pattern:'* * * * *',environments:['PRODUCTION','STAGING'] as ['PRODUCTION','STAGING']}}:{}),
 maxDuration:60,retry:{maxAttempts:1},queue:{name:'job-maintenance-v1',concurrencyLimit:1},
 run:async()=>{const db=workerDatabase(),key=workerBudgetKey(),mode=jobConfiguration().mode;
  return recordJobMaintenance(db,key,()=>recoverWorkerServices({
   dispatch:()=>automaticDispatch(db,key),billing:()=>maintainBilling(db),cleanup:()=>pruneJobEvidence(db),
   ready:()=>{if(mode==='LIVE'){paymentConfiguration();configuredResearchModels();}},
  }));}});
