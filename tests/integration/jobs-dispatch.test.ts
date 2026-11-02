import {afterAll,beforeAll,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import {jobsFixture} from './jobs-fixture';
import {admitJob} from '@/server/jobs/admission';
import {maintainJobDispatch} from '@/server/jobs/dispatch';
import {jobOutbox} from '@/db/schema';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);afterAll(()=>f?.pg.close());
it('keeps the outbox pending when watchdog delivery fails before execution',async()=>{
 const id=await admitJob(f.db,f.subject,{version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()},f.key);let executed=false;
 expect(await maintainJobDispatch(f.db,f.key,{watch:async()=>{throw new Error('Transport unavailable');},execute:async()=>{executed=true;}})).toBe(0);
 expect(executed).toBe(false);const [row]=await f.db.select().from(jobOutbox).where(eq(jobOutbox.jobId,id));expect(row.state).toBe('PENDING');expect(row.attempts).toBe(1);
 await f.db.update(jobOutbox).set({availableAt:new Date(Date.now()-1000)});
 await expect(maintainJobDispatch(f.db,f.key,{watch:async()=>{throw new Error('Transport unavailable');},execute:async()=>{executed=true;}},true)).rejects.toThrow('Transport unavailable');
 expect((await f.db.select().from(jobOutbox))[0].state).toBe('PENDING');
});
it('redelivers stable keys after an ambiguous execution acknowledgement',async()=>{
 await f.db.update(jobOutbox).set({availableAt:new Date(Date.now()-1000)});
 const keys:string[]=[];let first=true;
 const transport={watch:async()=>{},execute:async(claim:{key:string})=>{keys.push(claim.key);if(first){first=false;throw new Error('Lost acknowledgement');}}};
 expect(await maintainJobDispatch(f.db,f.key,transport)).toBe(0);
 await f.db.update(jobOutbox).set({availableAt:new Date(Date.now()-1000)});
 expect(await maintainJobDispatch(f.db,f.key,transport)).toBe(1);expect(keys[0]).toBe(keys[1]);
});
