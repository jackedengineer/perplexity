import {afterAll,beforeAll,expect,it} from 'vitest';
import {jobsFixture} from './jobs-fixture';
import {billingCheckouts,billingInbox,billingReversals,jobPeriods} from '@/db/schema';
import {liveOffer,testOffer} from '@/server/payments/offer';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
let f:Awaited<ReturnType<typeof jobsFixture>>;
beforeAll(async()=>{f=await jobsFixture();},30000);
afterAll(()=>f?.pg.close());
it('keeps historical test grants and permits a separate live checkout for the same owner and request',async()=>{
 const [test]=await f.db.select().from(billingCheckouts);
 const [live]=await f.db.insert(billingCheckouts).values({...test,id:crypto.randomUUID(),environment:'LIVE',priceKey:liveOffer.priceKey,subscriptionId:'sub_liveschema'}).returning();
 expect(live.requestId).toBe(test.requestId);
 const [prior]=await f.db.select().from(jobPeriods);expect(prior).toMatchObject({environment:'TEST',jobLimit:10});
 await expect(f.db.insert(jobPeriods).values({userId:f.owner,environment:'LIVE',paymentId:'pay_wrongmode',invoiceId:'inv_wrongmode',subscriptionId:test.subscriptionId!,startsAt:prior.startsAt,endsAt:prior.endsAt,jobLimit:7})).rejects.toThrow();
 await expect(f.db.insert(jobPeriods).values({userId:f.owner,environment:'LIVE',paymentId:'pay_wronglimit',invoiceId:'inv_wronglimit',subscriptionId:live.subscriptionId!,startsAt:prior.startsAt,endsAt:prior.endsAt,jobLimit:10})).rejects.toThrow();
 const [period]=await f.db.insert(jobPeriods).values({userId:f.owner,environment:'LIVE',paymentId:'pay_liveschema',invoiceId:'inv_liveschema',subscriptionId:live.subscriptionId!,startsAt:prior.startsAt,endsAt:prior.endsAt,jobLimit:7}).returning();
 expect(period.jobLimit).toBe(7);
});
it('rejects relabeling offers or a period belonging to another owner',async()=>{
 const [prior]=await f.db.select().from(jobPeriods);
 for(const [environment,priceKey] of [['LIVE',testOffer.priceKey],['TEST',liveOffer.priceKey],['other',liveOffer.priceKey]]){
  await expect(f.db.insert(billingCheckouts).values({userId:f.owner,requestId:crypto.randomUUID(),planId:'plan_invalid',environment,priceKey,state:'UNKNOWN'})).rejects.toThrow();
 }
 await expect(f.db.insert(jobPeriods).values({userId:crypto.randomUUID(),environment:'TEST',paymentId:'pay_otherowner',invoiceId:'inv_otherowner',subscriptionId:prior.subscriptionId,startsAt:prior.startsAt,endsAt:prior.endsAt,jobLimit:10})).rejects.toThrow();
});
it('namespaces webhook identities and reversal tombstones by trusted server mode',async()=>{
 for(const environment of ['TEST','LIVE']){
  await f.db.insert(billingInbox).values({environment,eventId:'evt_shared',bodyHash:'a'.repeat(64),kind:'subscription.charged'});
  await f.db.insert(billingReversals).values({environment,paymentId:'pay_shared',reason:'payment.refunded'});
 }
 expect(await f.db.select().from(billingInbox)).toHaveLength(2);
 expect(await f.db.select().from(billingReversals)).toHaveLength(2);
 await expect(f.db.insert(billingInbox).values({environment:'LIVE',eventId:'evt_shared',bodyHash:'a'.repeat(64),kind:'subscription.charged'})).rejects.toThrow();
 await expect(f.db.insert(billingReversals).values({environment:'unknown',paymentId:'pay_invalid',reason:'payment.refunded'})).rejects.toThrow();
});
it('upgrades existing TEST financial records without relabeling or resetting their counters',async()=>{
 const pg=new PGlite();
 try{
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  for(const entry of journal.entries.filter((e:{idx:number})=>e.idx<29))await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));
  await pg.exec(`
   INSERT INTO "user"(id,name,email,email_verified) VALUES ('migration-fixture','Migration fixture','migration@example.test',true);
   INSERT INTO app_users(auth_subject) VALUES ('migration-fixture');
   INSERT INTO billing_checkouts(user_id,request_id,plan_id,price_key,environment,subscription_id,state)
    SELECT id,gen_random_uuid(),'plan_migration','pro-monthly-inr-v1','TEST','sub_migration','READY' FROM app_users;
   INSERT INTO job_periods(user_id,environment,payment_id,invoice_id,subscription_id,starts_at,ends_at,job_limit,reserved_jobs,spent_jobs)
    SELECT id,'TEST','pay_migration','inv_migration','sub_migration',now()-interval '1 hour',now()+interval '1 day',10,1,2 FROM app_users;
   INSERT INTO billing_inbox(event_id,body_hash,kind,state,attempts) VALUES ('evt_migration',repeat('a',64),'subscription.charged','PENDING',3);
   INSERT INTO billing_reversals(payment_id,reason) VALUES ('pay_reversed','payment.refunded');
  `);
  const entry=journal.entries.find((e:{idx:number})=>e.idx===29);
  await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));
  expect((await pg.query('SELECT environment,job_limit,reserved_jobs,spent_jobs FROM job_periods')).rows).toEqual([{environment:'TEST',job_limit:10,reserved_jobs:1,spent_jobs:2}]);
  expect((await pg.query('SELECT environment,state,attempts FROM billing_inbox')).rows).toEqual([{environment:'TEST',state:'PENDING',attempts:3}]);
  expect((await pg.query('SELECT environment,payment_id,reason FROM billing_reversals')).rows).toEqual([{environment:'TEST',payment_id:'pay_reversed',reason:'payment.refunded'}]);
 }finally{await pg.close();}
});
