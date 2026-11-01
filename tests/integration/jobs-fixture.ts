import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
export async function jobsFixture(){
 const pg=new PGlite(),journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 for(const entry of journal.entries)await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));
 const db=drizzle(pg,{schema}),subject='jobs-'+crypto.randomUUID(),owner=crypto.randomUUID(),period=crypto.randomUUID();
 await pg.query('INSERT INTO "user"(id,name,email,email_verified) VALUES ($1,$1,$2,true)',[subject,subject+'@example.test']);
 await db.insert(schema.appUsers).values({id:owner,authSubject:subject});
 await db.insert(schema.jobPeriods).values({id:period,userId:owner,environment:'TEST',paymentId:'pay_'+owner,invoiceId:'inv_'+owner,subscriptionId:'sub_'+owner,startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+3600000),jobLimit:10});
 const key='jobs-'+owner;
 for(const kind of ['PERIOD','DAY'] as const)await db.insert(schema.operatorUsageBuckets).values({budgetKey:key,kind,startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+3600000),providerLimitMicroUsd:100000n});
 return {pg,db,subject,owner,period,key};
}
