import {task,schedules,tasks} from '@trigger.dev/sdk';
import {z} from 'zod';
import {workerDatabase} from '../src/server/jobs/connection';
import {consumeJob,dispatchJobs} from '../src/server/jobs/consumer';
export const executeJob=task({id:'execute-job-v1',maxDuration:120,retry:{maxAttempts:1},queue:{name:'durable-jobs-v1',concurrencyLimit:1},
 run:async(raw:unknown)=>{const payload=z.strictObject({jobId:z.uuid()}).parse(raw);return consumeJob(workerDatabase(),payload.jobId);}});
export const maintainJobs=schedules.task({id:'maintain-jobs-v1',cron:{pattern:'* * * * *',environments:['STAGING']},maxDuration:60,retry:{maxAttempts:1},queue:{name:'job-maintenance-v1',concurrencyLimit:1},
 run:async()=>dispatchJobs(workerDatabase(),async claim=>{
  await tasks.trigger<typeof executeJob>('execute-job-v1',{jobId:claim.jobId},{idempotencyKey:claim.key,idempotencyKeyTTL:'24h',maxAttempts:1});
 })});
