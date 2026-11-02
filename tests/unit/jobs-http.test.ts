import {expect,it,vi} from 'vitest';
import {createJobsHttp} from '@/server/jobs/http';
const backend={list:vi.fn(async()=>[]),admit:vi.fn(async()=>crypto.randomUUID()),read:vi.fn(async()=>({state:'QUEUED'})),events:vi.fn(async()=>[]),cancel:vi.fn(async()=>{}),remove:vi.fn(async()=>{})};
const make=(subject:string|null='owner',enabled=true)=>createJobsHttp({enabled:()=>enabled,subject:async()=>subject,origin:()=> 'http://localhost:3000',consume:async()=>{},backend:()=>backend});
it('requires current identity and default-off availability before all operations',async()=>{
 expect((await make(null).list(new Request('http://localhost:3000/api/jobs'))).status).toBe(401);
 expect((await make('owner',false).list(new Request('http://localhost:3000/api/jobs'))).status).toBe(404);
});
it('requires same-origin authenticated deletion and does not accept a caller-selected identity',async()=>{
 const id=crypto.randomUUID(),url='http://localhost:3000/api/jobs/'+id+'/delete';
 expect((await make(null).remove(new Request(url,{method:'POST',headers:{origin:'http://localhost:3000'}}),id)).status).toBe(401);
 expect((await make().remove(new Request(url,{method:'POST',headers:{origin:'https://attacker.test'}}),id)).status).toBe(403);
 expect((await make().remove(new Request(url,{method:'POST',headers:{origin:'http://localhost:3000'},body:'{"subject":"victim"}'}),id)).status).toBe(400);
 const response=await make().remove(new Request(url,{method:'POST',headers:{origin:'http://localhost:3000'}}),id);
 expect(response.status).toBe(200);expect(backend.remove).toHaveBeenLastCalledWith('owner',id);
 expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('rejects cross-origin submission, oversized bodies and caller-owned worker fields',async()=>{
 const base={version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()};
 const post=(body:unknown,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/jobs',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 expect((await make().submit(post(base,'https://attacker.test'))).status).toBe(403);
 expect((await make().submit(post({...base,owner:'victim'}))).status).toBe(400);
 expect((await make().submit(post({text:'a'.repeat(10000)}))).status).toBe(413);
 expect((await make().submit(post(base))).status).toBe(202);
});
it('bounds replay cursor and keeps private responses uncached',async()=>{
 const id=crypto.randomUUID();
 expect((await make().read(new Request('http://localhost:3000/api/jobs/'+id+'?after=-1'),id)).status).toBe(400);
 const response=await make().read(new Request('http://localhost:3000/api/jobs/'+id+'?after=0'),id);
 expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(backend.events).toHaveBeenLastCalledWith('owner',id,0);
});
