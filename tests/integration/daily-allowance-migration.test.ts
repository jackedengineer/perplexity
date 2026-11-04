import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq,sql} from 'drizzle-orm';
import {expect,it} from 'vitest';
import * as schema from '@/db/schema';

it('uplifts existing allowances without erasing spend, holds, original grants or operator ceilings',async()=>{
 const pg=new PGlite(),db=drizzle(pg,{schema});
 try{
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  for(const entry of journal.entries.filter((e:{idx:number})=>e.idx<35))await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));
  const people=[];
  for(const guest of [false,true]){
   const subject=randomUUID();
   await db.insert(schema.user).values({id:subject,name:'Migration test',email:`${subject}@example.test`,emailVerified:!guest,isAnonymous:guest});
   const [person]=await db.insert(schema.appUsers).values({authSubject:subject}).returning();people.push({person,guest});
   await db.execute(sql`SELECT ensure_free_credits(${person.id}::uuid)`);
   await db.update(schema.usageBuckets).set({settledCredits:2,reservedCredits:2,settledProviderMicroUsd:1000n,reservedProviderMicroUsd:60000n}).where(eq(schema.usageBuckets.userId,person.id));
  }
  const operator=await db.insert(schema.operatorUsageBuckets).values({kind:'DAY',budgetKey:'migration-test',startsAt:new Date(),endsAt:new Date(Date.now()+86400000),providerLimitMicroUsd:400000n,reservedProviderMicroUsd:50000n,settledProviderMicroUsd:1000n}).returning();
  const before=await db.select().from(schema.usageBuckets),grants=await db.select().from(schema.creditGrants);
  const migration=await readFile('drizzle/0035_daily_answer_allowance.sql','utf8');await pg.exec(migration);
  for(const {person,guest} of people){
   await db.execute(sql`SELECT ensure_free_credits(${person.id}::uuid)`);
   const after=await db.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,person.id));
   expect(after).toHaveLength(2);
   for(const row of after){
    const original=before.find(b=>b.id===row.id)!;
    expect(row).toMatchObject({settledCredits:2,reservedCredits:2,settledProviderMicroUsd:1000n,reservedProviderMicroUsd:60000n,startsAt:original.startsAt,endsAt:original.endsAt});
    expect(row.creditLimit).toBe(row.kind==='DAY'?(guest?20:150):(guest?620:4650));
    expect(row.providerLimitMicroUsd).toBe(row.kind==='DAY'?1000000n:31000000n);
   }
  }
  expect(await db.select().from(schema.creditGrants)).toEqual(grants);
  expect(await db.select().from(schema.operatorUsageBuckets)).toEqual(operator);
  const upgraded=await db.select().from(schema.usageBuckets);await pg.exec(migration);
  expect(await db.select().from(schema.usageBuckets)).toEqual(upgraded);
 }finally{await pg.close();}
},30000);
