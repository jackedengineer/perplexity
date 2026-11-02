import {tasks} from '@trigger.dev/sdk';
import {jobConfiguration} from '@/server/jobs/configuration';
import {createScheduledJobHttp} from '@/server/jobs/scheduled-http';
export const runtime='nodejs';
export const maxDuration=15;
export const GET=createScheduledJobHttp({
 enabled:()=>{try{jobConfiguration();return process.env.ENABLE_EXTERNAL_JOB_DISPATCH==='true';}catch{return false;}},
 secret:()=>process.env.JOBS_CRON_SECRET,
 kick:async()=>{await tasks.trigger('maintain-jobs-v1',{}, {idempotencyKey:'minute-maintenance:'+Math.floor(Date.now()/60000),idempotencyKeyTTL:'24h',maxAttempts:1},{retry:{maxAttempts:1}});},
});
