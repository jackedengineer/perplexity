import {afterEach,expect,it,vi} from 'vitest';
import {providerDeadline,STAGE_LIMITS} from '@/server/runs/budgets';
afterEach(()=>vi.useRealTimers());
it('charges elapsed claim/queue time against the stage budget on a monotonic clock',async()=>{
 vi.useFakeTimers();const claim={remainingMs:1000,observedAt:performance.now()};
 await vi.advanceTimersByTimeAsync(700);
 const budget=providerDeadline(claim,new AbortController().signal);
 expect(budget.signal.aborted).toBe(false);
 await vi.advanceTimersByTimeAsync(300);expect(budget.signal.aborted).toBe(true);budget.stop();
 expect(vi.getTimerCount()).toBe(0);
});
it('cannot revive an exhausted claim or extend it by changing wall-clock time',async()=>{
 vi.useFakeTimers();const claim={remainingMs:100,observedAt:performance.now()};
 await vi.advanceTimersByTimeAsync(101);vi.setSystemTime(Date.now()-86400000);
 const budget=providerDeadline(claim,new AbortController().signal);expect(budget.signal.aborted).toBe(true);budget.stop();
});
it('propagates caller cancellation and always clears the stage timer',()=>{
 vi.useFakeTimers();const incoming=new AbortController(),budget=providerDeadline({remainingMs:5000,observedAt:performance.now()},incoming.signal);
 incoming.abort('PRIVATE REASON');expect(budget.signal.aborted).toBe(true);expect(String(budget.signal.reason)).not.toContain('PRIVATE');budget.stop();expect(vi.getTimerCount()).toBe(0);
});
it('bounds the single-attempt FAST profile within its reserved monetary envelope',()=>{
 expect(Object.values(STAGE_LIMITS).reduce((sum,s)=>sum+s.capMicroUsd,0n)).toBe(48000n);
 expect(Object.values(STAGE_LIMITS).every(s=>s.maxDurationMs>0&&s.maxDurationMs<=12000)).toBe(true);
});
it('distinguishes its own expiry from caller cancellation even if a provider ignores abort',async()=>{
 vi.useFakeTimers();
 const incoming=new AbortController(),budget=providerDeadline({remainingMs:100,observedAt:performance.now()},incoming.signal);
 incoming.abort();await vi.advanceTimersByTimeAsync(200);
 expect(budget.expired).toBe(false);budget.stop();
 const timed=providerDeadline({remainingMs:100,observedAt:performance.now()},new AbortController().signal);
 await vi.advanceTimersByTimeAsync(100);expect(timed.expired).toBe(true);timed.stop();
});
