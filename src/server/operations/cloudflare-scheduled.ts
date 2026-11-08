type Environment=Record<string,string|undefined>;
export async function runCloudflareMaintenance(env:Environment,scheduledTime:number,dispatch:(request:Request)=>Promise<Response>,paidTick?:(force:boolean)=>Promise<unknown>){
 if(env.APPLICATION_ENV!=='production'||env.DEPLOYMENT_PLATFORM!=='cloudflare'||env.BETTER_AUTH_URL!=='https://perplexity.jacked.dev'||!Number.isFinite(scheduledTime))throw new Error('Scheduled environment unavailable');
 const valid=(value:string|undefined)=>!!value&&/^[A-Za-z0-9_-]{32,256}$/u.test(value);
 const native=env.JOB_EXECUTION_BACKEND==='cloudflare';
 if(!valid(env.CRON_SECRET)||!native&&!valid(env.JOBS_CRON_SECRET))throw new Error('Scheduled credentials unavailable');
 if(native&&!paidTick)throw new Error('Native maintenance unavailable');
 const hourly=new Date(scheduledTime).getUTCMinutes()===0;
 const endpoints=native?[]:[{path:'/api/internal/jobs-dispatch',secret:env.JOBS_CRON_SECRET}];
 if(hourly)endpoints.push({path:'/api/internal/recovery',secret:env.CRON_SECRET});
 // Finishes embedding any uploaded document whose background task was cut short.
 if(env.ENABLE_DOCUMENTS==='true')endpoints.push({path:'/api/internal/documents',secret:env.CRON_SECRET});
 const tasks=endpoints.map(async({path,secret})=>{
  const response=await dispatch(new Request('https://perplexity.jacked.dev'+path,{headers:{authorization:'Bearer '+secret,'user-agent':'perplex-cloudflare-cron/1.0'},signal:AbortSignal.timeout(30000)}));
  await response.body?.cancel();if(!response.ok)throw new Error('Maintenance unavailable');
 });
 if(native)tasks.push(Promise.resolve().then(()=>paidTick!(hourly)).then(()=>{}));
 // Recovery paths finish independently; one unavailable service cannot suppress
 // settlement in the other. The long job runs under the scheduled invocation.
 const results=await Promise.allSettled(tasks);
 for(const result of results)if(result.status==='rejected')throw result.reason;
}
