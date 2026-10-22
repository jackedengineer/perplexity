import { expect,it,vi } from 'vitest';
import { startRunMonitor } from '@/server/runs/monitor';
it('aborts cooperatively when another process fences the run',async()=>{
 vi.useFakeTimers();try{const monitor=startRunMonitor(async()=>false,new AbortController().signal,Date.now()+10000,100);
 await vi.advanceTimersByTimeAsync(100);expect(monitor.signal.aborted).toBe(true);monitor.stop();}finally{vi.useRealTimers();}
});
it('aborts on database uncertainty and removes timers on cleanup',async()=>{
 vi.useFakeTimers();try{const probe=vi.fn().mockRejectedValue(new Error('private'));const monitor=startRunMonitor(probe,new AbortController().signal,Date.now()+10000,100);
 await vi.advanceTimersByTimeAsync(100);expect(monitor.signal.aborted).toBe(true);monitor.stop();expect(vi.getTimerCount()).toBe(0);}finally{vi.useRealTimers();}
});
it('does not overlap probes or outlive the request deadline',async()=>{
 vi.useFakeTimers();try{const probe=vi.fn(()=>new Promise<boolean>(()=>{})),monitor=startRunMonitor(probe,new AbortController().signal,Date.now()+500,100);
 await vi.advanceTimersByTimeAsync(500);expect(probe).toHaveBeenCalledOnce();expect(monitor.signal.aborted).toBe(true);monitor.stop();}finally{vi.useRealTimers();}
});
