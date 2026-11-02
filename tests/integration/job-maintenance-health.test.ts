import {afterAll,beforeAll,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import {maintenanceStatus} from '@/db/schema';
import {recordJobMaintenance} from '@/server/jobs/maintenance';
import {jobsFixture} from './jobs-fixture';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);afterAll(()=>f?.pg.close());
it('records health only after actual worker work completes, and clears health on failure',async()=>{
 expect(await recordJobMaintenance(f.db,f.key,async()=>({sent:0}))).toEqual({sent:0});
 expect((await f.db.select().from(maintenanceStatus))[0]).toMatchObject({name:'paid-worker:'+f.key,outcome:'COMPLETED'});
 await expect(recordJobMaintenance(f.db,f.key,async()=>{throw new Error('Provider recovery failed');})).rejects.toThrow('Provider recovery failed');
 expect((await f.db.select().from(maintenanceStatus))[0]).toMatchObject({outcome:'FAILED',completedAt:null});
});
it('rejects overlapping maintenance and fences completion after lease replacement',async()=>{
 let start!:()=>void,finish!:()=>void;
 const started=new Promise<void>(r=>{start=r;}),waiting=new Promise<void>(r=>{finish=r;});
 const first=recordJobMaintenance(f.db,f.key,async()=>{start();await waiting;});await started;
 await expect(recordJobMaintenance(f.db,f.key,async()=>{})).rejects.toThrow('already running');
 await f.db.update(maintenanceStatus).set({startedAt:new Date(Date.now()+1000)}).where(eq(maintenanceStatus.name,'paid-worker:'+f.key));
 finish();await expect(first).rejects.toThrow('superseded');
 expect((await f.db.select().from(maintenanceStatus))[0]).toMatchObject({outcome:'RUNNING',completedAt:null});
});
