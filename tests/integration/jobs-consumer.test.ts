import {afterAll,beforeAll,expect,it} from 'vitest';
import {jobsFixture} from './jobs-fixture';
import {admitJob,readJob,readEvents} from '@/server/jobs/admission';
import {consumeJob,dispatchJobs} from '@/server/jobs/consumer';
import {cancelJob} from '@/server/jobs/worker';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);afterAll(()=>f.pg.close());
it('uses one consumer for dispatch and duplicate delivery, with persisted checkpoints',async()=>{
 const id=await admitJob(f.db,f.subject,{version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()},f.key);
 expect(await dispatchJobs(f.db,async claim=>{await consumeJob(f.db,claim.jobId,{stepMs:0});})).toBe(1);
 expect(await consumeJob(f.db,id,{stepMs:0})).toBe('DUPLICATE');
 expect((await readJob(f.db,f.subject,id)).state).toBe('COMPLETED');
 expect((await readEvents(f.db,f.subject,id,0)).filter(e=>e.code==='STEP_COMPLETED')).toHaveLength(3);
});
it('observes durable cancellation during execution and never emits completion',async()=>{
 const id=await admitJob(f.db,f.subject,{version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()},f.key);
 const run=consumeJob(f.db,id,{stepMs:100});
 // Wait on persisted receipt rather than an arbitrary browser delay.
 for(let i=0;i<50;i++){if((await readEvents(f.db,f.subject,id,0)).some(e=>e.code==='STEP_STARTED'))break;await new Promise(r=>setTimeout(r,2));}
 await cancelJob(f.db,f.subject,id);
 expect(await run).toBe('STOPPED');
 expect((await readEvents(f.db,f.subject,id,0)).some(e=>e.code==='COMPLETED')).toBe(false);
});
