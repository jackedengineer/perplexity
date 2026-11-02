type Environment=Record<string,string|undefined>;
export async function runCloudflareMaintenance(env:Environment,scheduledTime:number,dispatch:(request:Request)=>Promise<Response>){
 if(env.APPLICATION_ENV!=='production'||env.DEPLOYMENT_PLATFORM!=='cloudflare'||env.BETTER_AUTH_URL!=='https://perplexity.jacked.dev'||!Number.isFinite(scheduledTime))throw new Error('Scheduled environment unavailable');
 const valid=(value:string|undefined)=>!!value&&/^[A-Za-z0-9_-]{32,256}$/u.test(value);
 if(!valid(env.CRON_SECRET)||!valid(env.JOBS_CRON_SECRET))throw new Error('Scheduled credentials unavailable');
 const endpoints=[{path:'/api/internal/jobs-dispatch',secret:env.JOBS_CRON_SECRET}];
 if(new Date(scheduledTime).getUTCMinutes()===0)endpoints.push({path:'/api/internal/recovery',secret:env.CRON_SECRET});
 await Promise.all(endpoints.map(async({path,secret})=>{
  const response=await dispatch(new Request('https://perplexity.jacked.dev'+path,{headers:{authorization:'Bearer '+secret,'user-agent':'perplex-cloudflare-cron/1.0'},signal:AbortSignal.timeout(30000)}));
  await response.body?.cancel();if(!response.ok)throw new Error('Maintenance unavailable');
 }));
}
