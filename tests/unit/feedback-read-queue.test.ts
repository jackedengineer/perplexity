import {expect,it} from 'vitest';
import {queueFeedbackRead} from '@/components/conversations/feedback-read-queue';
it('serializes feedback reads across answer components without caching owner data',async()=>{
 let active=0,peak=0;let release!:()=>void;
 const wait=new Promise<void>(resolve=>{release=resolve;});
 const work=async()=>{active++;peak=Math.max(peak,active);await wait;active--;return 'done';};
 const first=queueFeedbackRead(work),second=queueFeedbackRead(work);
 await Promise.resolve();await Promise.resolve();expect(peak).toBe(1);release();
 expect(await Promise.all([first,second])).toEqual(['done','done']);expect(peak).toBe(1);
});
it('skips aborted queued reads and releases the queue after failures',async()=>{
 const controller=new AbortController();controller.abort();let dispatched=false;
 await expect(queueFeedbackRead(async()=>{dispatched=true;},controller.signal)).rejects.toThrow();expect(dispatched).toBe(false);
 await expect(queueFeedbackRead(async()=>{throw Error('Unavailable');})).rejects.toThrow('Unavailable');
 expect(await queueFeedbackRead(async()=>42)).toBe(42);
});
