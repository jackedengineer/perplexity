import {beforeAll,afterAll,it,expect} from 'vitest';
import {eq} from 'drizzle-orm';
import {durableJobs,jobSteps,jobPeriods,jobOutbox,jobReservations,operatorUsageBuckets} from '@/db/schema';
import {jobsFixture} from './jobs-fixture';
import {admitJob,readEvents,readJob} from '@/server/jobs/admission';
import {claimJob,startStep,completeStep,completeJob,cancelJob,recoverJobs,heartbeat} from '@/server/jobs/worker';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);afterAll(()=>f?.pg.close());
const admit=()=>admitJob(f.db,f.subject,{version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()},f.key);
it('claims once, checkpoints completed work and fences a worker after recovery',async()=>{
 const id=await admit(),lease=await claimJob(f.db,id);expect(lease).not.toBeNull();expect(await claimJob(f.db,id)).toBeNull();
 expect(await startStep(f.db,lease!,'checkpoint')).toBe('START');
 await completeStep(f.db,lease!,'checkpoint',0n);
 await f.pg.query(`UPDATE durable_jobs SET lease_until=now()-interval '1 second' WHERE id=$1`,[id]);
 expect(await recoverJobs(f.db)).toBe(1);
 await expect(heartbeat(f.db,lease!)).rejects.toMatchObject({code:'STALE'});
 const resumed=await claimJob(f.db,id);expect(resumed!.generation).toBeGreaterThan(lease!.generation);
 expect(await startStep(f.db,resumed!,'checkpoint')).toBe('DONE');
 for(const key of ['resume','verify']){await startStep(f.db,resumed!,key);await completeStep(f.db,resumed!,key,0n);}
 await completeJob(f.db,resumed!);await completeJob(f.db,resumed!);
 expect((await readJob(f.db,f.subject,id)).state).toBe('COMPLETED');
 expect((await f.db.select().from(jobPeriods))[0]).toMatchObject({reservedJobs:0,spentJobs:1});
 const events=await readEvents(f.db,f.subject,id,0);expect(events.map(e=>e.sequence)).toEqual(events.map((_,i)=>i+1));
 expect(events.filter(e=>e.code==='STEP_STARTED'&&e.step==='checkpoint')).toHaveLength(1);
});
it('persists cancellation before worker acknowledgment and denies late output',async()=>{
 const id=await admit(),lease=(await claimJob(f.db,id))!;
 await startStep(f.db,lease,'checkpoint');
 await expect(cancelJob(f.db,'other',id)).rejects.toMatchObject({code:'NOT_FOUND'});
 await cancelJob(f.db,f.subject,id);await cancelJob(f.db,f.subject,id);
 await expect(completeStep(f.db,lease,'checkpoint',0n)).rejects.toMatchObject({code:'STALE'});
 expect((await readJob(f.db,f.subject,id)).state).toBe('CANCELLED');
 expect(await claimJob(f.db,id)).toBeNull();
});
it('retains unknown billable exposure on lost leases and never replays the call',async()=>{
 const id=await admit();await claimJob(f.db,id);
 // Fault injection for the future billable executor: a sent call with no receipt.
 await f.pg.query(`UPDATE job_steps SET kind='MODEL',cap_micro_usd=1000,state='STARTED',generation=1 WHERE job_id=$1 AND key='checkpoint'`,[id]);
 await f.pg.query(`UPDATE job_reservations SET reserved_micro_usd=1000 WHERE job_id=$1`,[id]);
 await f.db.update(operatorUsageBuckets).set({reservedProviderMicroUsd:1000n});
 await f.pg.query(`UPDATE durable_jobs SET lease_until=now()-interval '1 second' WHERE id=$1`,[id]);
 await recoverJobs(f.db);await recoverJobs(f.db);
 expect(await claimJob(f.db,id)).toBeNull();
 expect((await readJob(f.db,f.subject,id))).toMatchObject({state:'FAILED',heldMicroUsd:'1000',spentMicroUsd:'0'});
 expect((await f.db.select().from(jobReservations).where(eq(jobReservations.jobId,id)))[0].settledAt).not.toBeNull();
 expect((await f.db.select().from(operatorUsageBuckets)).every(b=>b.reservedProviderMicroUsd===1000n)).toBe(true);
 expect((await f.db.select().from(jobSteps).where(eq(jobSteps.jobId,id))).find(s=>s.key==='checkpoint')?.state).toBe('UNKNOWN');
});
it('expires queued jobs even after dispatch exhaustion; settles once',async()=>{
 const id=await admit();
 await f.pg.query(`UPDATE durable_jobs SET deadline_at=created_at+interval '1 millisecond',created_at=created_at-interval '1 second' WHERE id=$1`,[id]);
 await f.db.update(jobOutbox).set({attempts:20}).where(eq(jobOutbox.jobId,id));
 await recoverJobs(f.db);await recoverJobs(f.db);
 expect((await f.db.select().from(durableJobs).where(eq(durableJobs.id,id)))[0].state).toBe('EXPIRED');
 expect((await f.db.select().from(jobPeriods))[0].reservedJobs).toBe(0);
});
it('redelivers acknowledged dispatches whose consumer never starts',async()=>{
 const id=await admit();await f.pg.query(`UPDATE job_outbox SET state='DELIVERED',available_at=now()-interval '1 minute' WHERE job_id=$1`,[id]);
 expect(await recoverJobs(f.db)).toBe(1);
 const [dispatch]=await f.db.select().from(jobOutbox).where(eq(jobOutbox.jobId,id));expect(dispatch).toMatchObject({state:'PENDING',revision:2});
 await cancelJob(f.db,f.subject,id);
});
it('settles known step spend once and preserves unrelated unknown-cost holds',async()=>{
 const before=await f.db.select().from(operatorUsageBuckets),id=await admit();
 await f.pg.query(`UPDATE job_steps SET kind='MODEL',cap_micro_usd=1000,state='SUCCEEDED',cost_micro_usd=400,started_at=now() WHERE job_id=$1 AND key='checkpoint'`,[id]);
 await f.pg.query('UPDATE job_reservations SET reserved_micro_usd=1000 WHERE job_id=$1',[id]);
 await f.pg.exec('UPDATE operator_usage_buckets SET reserved_provider_micro_usd=reserved_provider_micro_usd+1000');
 await cancelJob(f.db,f.subject,id);await cancelJob(f.db,f.subject,id);
 const after=await f.db.select().from(operatorUsageBuckets);
 for(const row of after){const prior=before.find(b=>b.id===row.id)!;expect(row.reservedProviderMicroUsd).toBe(prior.reservedProviderMicroUsd);expect(row.settledProviderMicroUsd).toBe(prior.settledProviderMicroUsd+400n);}
 expect(await readJob(f.db,f.subject,id)).toMatchObject({spentMicroUsd:'400',heldMicroUsd:'0'});
});
