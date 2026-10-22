import { expect,it,vi } from 'vitest';
import { createRecoveryHttp } from '@/server/runs/recovery-http';
const origin='https://example.test',secret='x'.repeat(32),identity={user:{id:'subject'},sessionId:'session'};
function fixture(){const cancel=vi.fn().mockResolvedValue(undefined),load=vi.fn().mockResolvedValue({state:'UNAVAILABLE'}),sweep=vi.fn().mockResolvedValue({recovered:1}),log=vi.fn();return {cancel,load,sweep,log,http:createRecoveryHttp({identity:async()=>identity,origin:()=>origin,cancel,load,sweep,secret:()=>secret,log})};}
it('cancellation requires same origin and an empty body before any state mutation',async()=>{
 const f=fixture();expect((await f.http.cancel(new Request(origin,{method:'POST'}),'id')).status).toBe(403);expect((await f.http.cancel(new Request(origin,{method:'POST',headers:{origin},body:'{"cost":0}'}),'id')).status).toBe(422);
 expect(f.cancel).not.toHaveBeenCalled();
});
it('cancellation returns a fresh canonical status without caching',async()=>{
 const f=fixture(),r=await f.http.cancel(new Request(origin,{method:'POST',headers:{origin}}),'id');
 expect(r.status).toBe(200);expect(f.cancel).toHaveBeenCalledWith(identity,'id');expect(f.load).toHaveBeenCalledWith(identity,'id');expect(r.headers.get('cache-control')).toContain('no-store');
});
it('cron authentication fails closed without configuration or a valid bearer',async()=>{
 const f=fixture();expect((await f.http.cron(new Request(origin))).status).toBe(401);expect(f.sweep).not.toHaveBeenCalled();
 const empty=createRecoveryHttp({identity:async()=>null,origin:()=>origin,cancel:f.cancel,load:f.load,sweep:f.sweep,secret:()=>undefined,log:f.log});
 expect((await empty.cron(new Request(origin))).status).toBe(503);
});
it('cron accepts only its secret and fixed server-owned job parameters',async()=>{
 const f=fixture();expect((await f.http.cron(new Request(origin+'?refund=all',{headers:{authorization:'Bearer '+secret}}))).status).toBe(422);
 expect(f.sweep).not.toHaveBeenCalled();expect((await f.http.cron(new Request(origin,{headers:{authorization:'Bearer '+secret}}))).status).toBe(200);expect(f.sweep).toHaveBeenCalledOnce();
});
it('scheduler failures do not leak diagnostics',async()=>{
 const f=fixture();f.sweep.mockRejectedValue(new Error('PRIVATE_DATABASE_DETAIL'));
 const r=await f.http.cron(new Request(origin,{headers:{authorization:'Bearer '+secret}}));expect(r.status).toBe(503);expect(await r.text()).not.toContain('PRIVATE_DATABASE_DETAIL');
});
it('accepts an empty stream body produced by the Node route adapter',async()=>{
 const init:RequestInit & {duplex:'half'}={method:'POST',headers:{origin},body:new ReadableStream({start(c){c.close();}}),duplex:'half'};
 expect((await fixture().http.cancel(new Request(origin,init),'id')).status).toBe(200);
});
