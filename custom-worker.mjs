import handler from './.open-next/worker.js';
import {runCloudflareMaintenance} from './src/server/operations/cloudflare-scheduled.ts';
import {runCloudflarePaidTick} from './src/server/jobs/cloudflare-runtime.ts';

const worker={
 fetch:handler.fetch,
 async scheduled(event,env,ctx){
  if(event.cron!=='* * * * *')throw new Error('Unknown maintenance schedule');
  // Invoke the generated handler directly. No public self-fetch, arbitrary
  // target, database credential or provider request is exposed by this wrapper.
  await runCloudflareMaintenance(env,event.scheduledTime,request=>handler.fetch(request,env,ctx),async force=>{
   const started=performance.now(),outcome=await runCloudflarePaidTick(env,env.PAID_ACTIVITY,force);
   console.info(JSON.stringify({event:'jobs.cloudflare_tick',outcome,durationMs:Math.round(performance.now()-started)}));
  });
 },
};
export default worker;
