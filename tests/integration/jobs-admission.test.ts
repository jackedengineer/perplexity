import {beforeAll,afterAll,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import {jobOutbox,jobPeriods,operatorUsageBuckets,jobEvents} from '@/db/schema';
import {admitJob,readJob,readEvents,claimDispatch,finishDispatch} from '@/server/jobs/admission';
import {jobsFixture} from './jobs-fixture';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);afterAll(()=>f?.pg.close());
const submit=()=>({version:1 as const,workflow:'execution-check-v1' as const,requestId:crypto.randomUUID()});
it('atomically admits a paid owned job, steps, reservation, events and outbox; replay charges once',async()=>{
 const input=submit(),id=await admitJob(f.db,f.subject,input,f.key);
 expect(await admitJob(f.db,f.subject,input,f.key)).toBe(id);
 expect((await f.db.select().from(jobPeriods))[0].reservedJobs).toBe(1);
 expect((await f.db.select().from(jobOutbox))).toHaveLength(1);
 expect((await readEvents(f.db,f.subject,id,0)).map(e=>e.code)).toEqual(['QUEUED']);
 expect(await readEvents(f.db,f.subject,id,1)).toEqual([]);
 await expect(readJob(f.db,'other-owner',id)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(readEvents(f.db,'other-owner',id,0)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(admitJob(f.db,f.subject,submit(),f.key)).rejects.toMatchObject({code:'CONFLICT'});
 expect(await f.db.select().from(jobEvents)).toHaveLength(1);
});
it('leases dispatch with a stable idempotency key and fences late acknowledgments',async()=>{
 const first=await claimDispatch(f.db);expect(first).not.toBeNull();
 expect(await claimDispatch(f.db)).toBeNull();
 await f.pg.exec(`UPDATE job_outbox SET lease_until=now()-interval '1 second'`);
 const retry=await claimDispatch(f.db);expect(retry?.key).toBe(first?.key);expect(retry?.token).not.toBe(first?.token);
 expect(await finishDispatch(f.db,first!,true)).toBe(false);
 expect(await finishDispatch(f.db,retry!,true)).toBe(true);
 expect(await claimDispatch(f.db)).toBeNull();
});
it('denies expired, guest and missing paid access without minting dispatch or budget',async()=>{
 await expect(admitJob(f.db,'unrecognized',submit(),f.key)).rejects.toMatchObject({code:'PAYMENT_REQUIRED'});
 await f.db.update(jobPeriods).set({state:'REVOKED'}).where(eq(jobPeriods.id,f.period));
 // Existing idempotent replies remain readable, new work is still forbidden.
 const before=await f.db.select().from(operatorUsageBuckets);
 await expect(admitJob(f.db,f.subject,submit(),f.key)).rejects.toMatchObject({code:'CONFLICT'});
 expect(await f.db.select().from(operatorUsageBuckets)).toEqual(before);
});
