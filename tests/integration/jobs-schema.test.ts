import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,it,expect} from 'vitest';
const pg=new PGlite(),owner=crypto.randomUUID(),period=crypto.randomUUID(),job=crypto.randomUUID(),intent=crypto.randomUUID();
beforeAll(async()=>{
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 for(const entry of journal.entries)await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));
 await pg.exec(`INSERT INTO "user"(id,name,email) VALUES ('jobs-schema','Test','jobs-schema@example.test')`);
 await pg.query('INSERT INTO app_users(id,auth_subject) VALUES ($1,$2)',[owner,'jobs-schema']);
 await pg.query(`INSERT INTO job_periods(id,user_id,environment,payment_id,invoice_id,subscription_id,starts_at,ends_at,job_limit) VALUES ($1,$2,'TEST','pay_schema','inv_schema','sub_schema',now(),now()+interval '1 day',3)`,[period,owner]);
 await pg.query(`INSERT INTO durable_jobs(id,user_id,request_id,fingerprint,workflow,period_id,deadline_at) VALUES ($1,$2,$3,$4,'execution-check-v1',$5,now()+interval '2 minutes')`,[job,owner,intent,'a'.repeat(64),period]);
},30000);
afterAll(()=>pg.close());
it('pins a registered workflow and one active job per owner/intent',async()=>{
 await expect(pg.query('UPDATE durable_jobs SET workflow=$1 WHERE id=$2',['arbitrary-browser',job])).rejects.toThrow(/check/);
 await expect(pg.query(`INSERT INTO durable_jobs(user_id,request_id,fingerprint,workflow,period_id,deadline_at) SELECT user_id,$1,fingerprint,workflow,period_id,deadline_at FROM durable_jobs WHERE id=$2`,[crypto.randomUUID(),job])).rejects.toThrow(/unique/);
 await expect(pg.query(`UPDATE durable_jobs SET next_event=0 WHERE id=$1`,[job])).rejects.toThrow(/check/);
});
it('rejects live/test confusion and oversubscribed paid periods',async()=>{
 for(const change of ["environment='LIVE'","reserved_jobs=4","spent_jobs=-1","state='PENDING'","ends_at=starts_at"])
  await expect(pg.exec(`UPDATE job_periods SET ${change}`)).rejects.toThrow(/check/);
 await expect(pg.query(`INSERT INTO job_periods(user_id,environment,payment_id,invoice_id,subscription_id,starts_at,ends_at,job_limit) SELECT user_id,environment,payment_id,'inv_other',subscription_id,starts_at,ends_at,job_limit FROM job_periods`)).rejects.toThrow(/unique/);
});
it('bounds step costs, event identity and dispatch attempts',async()=>{
 await pg.query(`INSERT INTO job_steps(job_id,key,kind,cap_micro_usd) VALUES ($1,'checkpoint','SYSTEM',0)`,[job]);
 for(const change of ["cost_micro_usd=1","state='SUCCEEDED'","cap_micro_usd=1"])
  await expect(pg.exec(`UPDATE job_steps SET ${change}`)).rejects.toThrow(/check/);
 await pg.query(`INSERT INTO job_events(job_id,sequence,code) VALUES ($1,1,'QUEUED')`,[job]);
 await expect(pg.query(`INSERT INTO job_events(job_id,sequence,code) VALUES ($1,1,'QUEUED')`,[job])).rejects.toThrow(/unique/);
 await pg.query('INSERT INTO job_outbox(job_id) VALUES ($1)',[job]);
 await expect(pg.exec('UPDATE job_outbox SET attempts=21')).rejects.toThrow(/check/);
});
it('keeps immutable grant and step snapshots out of runtime UPDATE privileges',async()=>{
 await pg.exec('CREATE ROLE perplex_web NOINHERIT NOCREATEDB NOCREATEROLE');
 await pg.exec(await readFile('scripts/runtime-grants.sql','utf8'));
 await pg.exec('SET ROLE perplex_web');
 try{
  expect((await pg.query(`SELECT has_column_privilege(current_user,'job_periods','job_limit','UPDATE') AS escalate, has_column_privilege(current_user,'job_steps','cap_micro_usd','UPDATE') AS cap,has_table_privilege(current_user,'job_events','DELETE') AS erase`)).rows).toEqual([{escalate:false,cap:false,erase:false}]);
  expect((await pg.query('SELECT id FROM durable_jobs')).rows).toHaveLength(1);
 }finally{await pg.exec('RESET ROLE');}
});
