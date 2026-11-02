import {EventEmitter} from 'node:events';
import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({pools:[] as (EventEmitter&{options:Record<string,unknown>;end:ReturnType<typeof vi.fn>})[]}));
vi.mock('pg',()=>({Pool:class extends EventEmitter{
 options:Record<string,unknown>;end=vi.fn(async()=>{});
 constructor(options:Record<string,unknown>){super();this.options=options;state.pools.push(this);}
}}));
vi.mock('drizzle-orm/node-postgres',()=>({drizzle:(pool:unknown)=>({pool})}));
import {openCloudflareJobDatabase} from '@/server/jobs/cloudflare-runtime';
it('never shares native sockets between scheduled invocations and closes each owned pool',async()=>{
 const one=openCloudflareJobDatabase('postgresql://runtime-fixture'),two=openCloudflareJobDatabase('postgresql://runtime-fixture');
 expect(one.db).not.toBe(two.db);expect(state.pools).toHaveLength(2);
 expect(state.pools[0].options).toMatchObject({max:2,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:10000});
 await one.close();expect(state.pools[0].end).toHaveBeenCalledOnce();expect(state.pools[1].end).not.toHaveBeenCalled();await two.close();
});
it('suppresses only late socket-close notifications for already removed clients',()=>{
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});openCloudflareJobDatabase('postgresql://runtime-fixture');
 const pool=state.pools.at(-1)!,removed={},active={};
 try{
  pool.emit('remove',removed);pool.emit('error',new Error('This socket has been closed.'),removed);expect(warning).not.toHaveBeenCalled();
  pool.emit('error',new Error('This socket has been closed.'),active);pool.emit('error',new Error('Other connection failure'),removed);
  expect(warning).toHaveBeenCalledTimes(2);expect(warning.mock.calls.flat().join('')).not.toContain('Other connection failure');
 }finally{warning.mockRestore();}
});
