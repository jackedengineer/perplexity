// Local workerd proof only; never used by production Wrangler configuration.
import {runCloudflarePaidTick} from '@/server/jobs/cloudflare-runtime';
const worker={
 fetch(){return new Response('Local zero-cost job fixture');},
 async scheduled(_event:unknown,env:Record<string,string|undefined>){
  void _event;
  if(env.JOB_ENVIRONMENT!=='TEST'||env.APPLICATION_ENV==='production'||env.ENABLE_RAZORPAY_LIVE_BILLING==='true')throw new Error('Development fixture only');
  // The isolated namespace contains only the zero-provider-cost system manifest.
  const result=await runCloudflarePaidTick(env,undefined,true);
  console.info(JSON.stringify({event:'local.scheduled_job',result}));
 },
};
export default worker;
