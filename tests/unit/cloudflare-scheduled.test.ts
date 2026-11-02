import {expect,it,vi} from 'vitest';
import {runCloudflareMaintenance} from '@/server/operations/cloudflare-scheduled';
const env={APPLICATION_ENV:'production',DEPLOYMENT_PLATFORM:'cloudflare',BETTER_AUTH_URL:'https://perplexity.jacked.dev',CRON_SECRET:'r'.repeat(40),JOBS_CRON_SECRET:'j'.repeat(40)};
it('invokes only fixed internal maintenance paths, never arbitrary URLs or paid inference',async()=>{
 const requests:Request[]=[],fetcher=vi.fn(async(request:Request)=>{requests.push(request);return new Response('{}');});
 await runCloudflareMaintenance(env,Date.UTC(2026,10,2,10,1),fetcher);
 expect(requests.map(r=>r.url)).toEqual(['https://perplexity.jacked.dev/api/internal/jobs-dispatch']);
 expect(requests[0].headers.get('authorization')).toBe('Bearer '+env.JOBS_CRON_SECRET);
 requests.length=0;await runCloudflareMaintenance(env,Date.UTC(2026,10,2,11,0),fetcher);
 expect(requests.map(r=>new URL(r.url).pathname)).toEqual(['/api/internal/jobs-dispatch','/api/internal/recovery']);
 expect(requests.every(r=>r.method==='GET'&&r.body===null)).toBe(true);
});
it('fails closed on other environments, malformed credentials and unsuccessful maintenance',async()=>{
 const fetcher=vi.fn(async()=>new Response('{}'));
 for(const patch of [{APPLICATION_ENV:'development'},{BETTER_AUTH_URL:'https://attacker.test'},{JOBS_CRON_SECRET:''},{CRON_SECRET:'short'}]){
  await expect(runCloudflareMaintenance({...env,...patch},Date.now(),fetcher)).rejects.toThrow();
 }
 expect(fetcher).not.toHaveBeenCalled();
 await expect(runCloudflareMaintenance(env,Date.now(),async()=>new Response('{}',{status:503}))).rejects.toThrow('Maintenance unavailable');
});
