import {expect,it,vi} from 'vitest';
import {recoverWorkerServices} from '@/server/jobs/maintenance';
it('continues billing recovery and cleanup when dispatch or inference readiness fails',async()=>{
 const billing=vi.fn(async()=>{}),cleanup=vi.fn(async()=>0),ready=vi.fn();
 await expect(recoverWorkerServices({dispatch:async()=>{throw new Error('Dispatch offline');},billing,cleanup,ready})).rejects.toThrow('Dispatch offline');
 expect(billing).toHaveBeenCalledTimes(1);expect(cleanup).toHaveBeenCalledTimes(1);expect(ready).not.toHaveBeenCalled();
 await expect(recoverWorkerServices({dispatch:async()=>0,billing,cleanup,ready:()=>{throw new Error('Inference paused');}})).rejects.toThrow('Inference paused');
 expect(billing).toHaveBeenCalledTimes(2);
});
