import {afterAll,beforeAll,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import {jobsFixture} from './jobs-fixture';
import {admitJob,readJob} from '@/server/jobs/admission';
import {dispatchCloudflareJob} from '@/server/jobs/cloudflare-dispatch';
import {consumeJob} from '@/server/jobs/consumer';
import {durableJobs,jobOutbox,jobPeriods} from '@/db/schema';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);afterAll(()=>f?.pg.close());
const admit=()=>admitJob(f.db,f.subject,{version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()},f.key);
it('records delivery before consuming and never repeats a completed effect',async()=>{
 const id=await admit();let executions=0;
 const consume=async(jobId:string)=>{
  executions++;expect(jobId).toBe(id);
  expect((await f.db.select().from(jobOutbox).where(eq(jobOutbox.jobId,id)))[0].state).toBe('DELIVERED');
  await consumeJob(f.db,id,{stepMs:0,budgetKey:f.key});
 };
 expect(await dispatchCloudflareJob(f.db,f.key,consume)).toBe('EXECUTED');
 expect(await dispatchCloudflareJob(f.db,f.key,consume)).toBe('IDLE');expect(executions).toBe(1);
 expect((await readJob(f.db,f.subject,id)).state).toBe('COMPLETED');
});
it('recovers a crash after delivery but before consumer claim without inventing a paid retry',async()=>{
 const id=await admit();
 await expect(dispatchCloudflareJob(f.db,f.key,async()=>{throw new Error('Process died before claim');})).rejects.toThrow('Process died');
 expect((await readJob(f.db,f.subject,id)).state).toBe('QUEUED');
 await f.db.update(jobOutbox).set({availableAt:new Date(Date.now()-60000)}).where(eq(jobOutbox.jobId,id));
 expect(await dispatchCloudflareJob(f.db,f.key,async jobId=>{await consumeJob(f.db,jobId,{stepMs:0,budgetKey:f.key});})).toBe('EXECUTED');
 expect((await f.db.select().from(jobOutbox).where(eq(jobOutbox.jobId,id)))[0].revision).toBe(2);
});
it('recovers deadlines during a pause without consuming queued execution',async()=>{
 const id=await admit();let executions=0;
 expect(await dispatchCloudflareJob(f.db,f.key,async()=>{executions++;},false)).toBe('PAUSED');
 await f.db.update(durableJobs).set({createdAt:new Date(Date.now()-3600000),deadlineAt:new Date(Date.now()-1000)}).where(eq(durableJobs.id,id));
 expect(await dispatchCloudflareJob(f.db,f.key,async()=>{executions++;},false)).toBe('PAUSED');
 expect(executions).toBe(0);expect((await readJob(f.db,f.subject,id)).state).toBe('EXPIRED');
 expect((await f.db.select().from(jobPeriods))[0].reservedJobs).toBe(0);
});
