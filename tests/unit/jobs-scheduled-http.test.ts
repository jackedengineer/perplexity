import {expect,it,vi} from 'vitest';
import {createScheduledJobHttp} from '@/server/jobs/scheduled-http';
const secret='s'.repeat(40),url='https://perplexity.jacked.dev/api/internal/jobs-dispatch';
it('rejects missing/forged credentials and arbitrary inputs before enqueueing',async()=>{
 const kick=vi.fn(async()=>{}),http=createScheduledJobHttp({enabled:()=>true,secret:()=>secret,kick});
 for(const token of ['', 'Bearer wrong', 'Bearer '+secret+'extra'])expect((await http(new Request(url,{headers:{authorization:token}}))).status).toBe(401);
 expect((await http(new Request(url+'?jobId=arbitrary',{headers:{authorization:'Bearer '+secret}}))).status).toBe(400);
 expect((await http(new Request(url,{method:'POST',body:'{}',headers:{authorization:'Bearer '+secret}}))).status).toBe(400);
 expect(kick).not.toHaveBeenCalled();
 expect((await http(new Request(url,{headers:{authorization:'Bearer '+secret}}))).status).toBe(202);
 expect(kick).toHaveBeenCalledTimes(1);
});
it('does not report task completion from acknowledgement or hide delivery failure',async()=>{
 const http=createScheduledJobHttp({enabled:()=>true,secret:()=>secret,kick:async()=>{throw new Error('Private credential details');}});
 const result=await http(new Request(url,{headers:{authorization:'Bearer '+secret}}));
 expect(result.status).toBe(503);expect(await result.text()).toBe('{"accepted":false}');
 expect(result.headers.get('cache-control')).toBe('private, no-store');
 expect((await createScheduledJobHttp({enabled:()=>false,secret:()=>secret,kick:async()=>{}})(new Request(url))).status).toBe(404);
});
