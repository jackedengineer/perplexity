import {expect,it,vi} from 'vitest';
import {markPaidActivity,shouldRunPaidTick,type PaidActivityStore} from '@/server/jobs/paid-activity';
const key='live-pilot-fixture';
it('keeps idle minute ticks away from Neon but always permits the hourly recovery fallback',async()=>{
 const store={get:vi.fn(async()=>null),put:vi.fn(async()=>{})};
 expect(await shouldRunPaidTick(store,key,false)).toBe(false);
 expect(await shouldRunPaidTick(store,key,true)).toBe(true);
 expect(await shouldRunPaidTick(undefined,key,false)).toBe(true);
 expect(await shouldRunPaidTick({...store,get:async()=>{throw Error('Unavailable');}},key,false)).toBe(true);
});
it('writes only bounded activity metadata and retains enough TTL for an accepted job deadline',async()=>{
 const values=new Map<string,string>();const put=vi.fn<PaidActivityStore['put']>(async(k,v)=>{values.set(k,v);});
 const store:PaidActivityStore={get:async k=>values.get(k)??null,put};
 await markPaidActivity(store,key);expect(put).toHaveBeenCalledOnce();
 const [storedKey,value,options]=put.mock.calls[0];
 expect(storedKey).toBe('paid-activity:'+key);expect(Number(value)).toBeGreaterThan(Date.now()+55*60000);
 expect(options).toEqual({expirationTtl:3600});
 expect(await shouldRunPaidTick(store,key,false)).toBe(true);
 await markPaidActivity(store,key);expect(put).toHaveBeenCalledOnce();
});
it('denies admissions when a wake-up cannot be recorded and bounds the wait',async()=>{
 await expect(markPaidActivity(undefined,key)).rejects.toMatchObject({code:'UNAVAILABLE'});
 await expect(markPaidActivity({get:async()=>null,put:async()=>{throw Error('Private upstream diagnostic');}},key)).rejects.toMatchObject({code:'UNAVAILABLE'});
 vi.useFakeTimers();try{
  const pending=expect(markPaidActivity({get:async()=>new Promise(()=>{}),put:async()=>{}},key)).rejects.toMatchObject({code:'UNAVAILABLE'});
  await vi.advanceTimersByTimeAsync(1600);await pending;
 }finally{vi.useRealTimers();}
});
