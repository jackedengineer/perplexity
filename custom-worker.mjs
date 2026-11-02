import handler from './.open-next/worker.js';
import {runCloudflareMaintenance} from './src/server/operations/cloudflare-scheduled.ts';

const worker={
 fetch:handler.fetch,
 async scheduled(event,env,ctx){
  if(event.cron!=='* * * * *')throw new Error('Unknown maintenance schedule');
  // Invoke the generated handler directly. No public self-fetch, arbitrary
  // target, database credential or provider request is exposed by this wrapper.
  await runCloudflareMaintenance(env,event.scheduledTime,request=>handler.fetch(request,env,ctx));
 },
};
export default worker;
