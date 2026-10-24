import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq,sql} from 'drizzle-orm';
import {afterAll,beforeAll,expect,it} from 'vitest';
import * as schema from '@/db/schema';
const pg=new PGlite(),db=drizzle(pg,{schema});
beforeAll(async()=>{const j=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const e of j.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,'utf8'));});
afterAll(()=>pg.close());
async function person(guest=false,verified=true){const id=randomUUID();await db.insert(schema.user).values({id,name:'Credit tester',email:`${id}@example.test`,emailVerified:verified,isAnonymous:guest});const [p]=await db.insert(schema.appUsers).values({authSubject:id}).returning();return p;}
it('issues one free grant despite repeated logins and preserves existing spend',async()=>{
 const p=await person();
 await db.execute(sql`SELECT ensure_free_credits(${p.id}::uuid)`);
 await db.update(schema.usageBuckets).set({settledCredits:4}).where(eq(schema.usageBuckets.userId,p.id));
 await db.execute(sql`SELECT ensure_free_credits(${p.id}::uuid)`);
 const grants=await db.select().from(schema.creditGrants).where(eq(schema.creditGrants.userId,p.id));
 expect(grants).toHaveLength(1);expect(grants[0].credits).toBe(40);
 expect((await db.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,p.id))).map(x=>x.settledCredits)).toEqual([4,4]);
});
it('grants six lifetime guest credits and never grants unverified registered accounts',async()=>{
 const guest=await person(true,false);await db.execute(sql`SELECT ensure_free_credits(${guest.id}::uuid)`);
 expect((await db.select().from(schema.creditGrants).where(eq(schema.creditGrants.userId,guest.id)))[0].credits).toBe(6);
 const unverified=await person(false,false);await expect(db.execute(sql`SELECT ensure_free_credits(${unverified.id}::uuid)`)).rejects.toThrow();
});
it('writes one append-only reservation/charge/release audit per admitted run',async()=>{
 const {seedCompletion}=await import('../helpers/completion');const {createFinalization}=await import('@/server/runs/finalize');
 const p=await seedCompletion(db);
 await createFinalization(db).fail(p.subject,p.runId,'PROVIDER_UNAVAILABLE');
 await createFinalization(db).fail(p.subject,p.runId,'PROVIDER_UNAVAILABLE');
 const ledger=await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.runId,p.runId));
 expect(ledger.map(l=>[l.kind,l.credits]).sort()).toEqual([['CHARGE',0],['RELEASE',5],['RESERVE',5]]);
});
it('retires expired guest content without deleting registered or linked history',async()=>{
 const {cleanExpiredGuests}=await import('@/server/auth/guest-retention');
 const {createConversationRepository}=await import('@/server/conversations/repository');
 const {linkGuest}=await import('@/server/billing/link-guest');
 const guest=await person(true,false),linked=await person(true,false),registered=await person();
 const repo=createConversationRepository(db);
 const old=await repo.create(guest.authSubject,{clientRequestId:randomUUID(),title:'Expired guest'});
 const saved=await repo.create(linked.authSubject,{clientRequestId:randomUUID(),title:'Saved to account'});
 await linkGuest(db,linked.authSubject,registered.authSubject);
 await db.update(schema.user).set({createdAt:new Date(Date.now()-31*86400000)}).where(sql`${schema.user.id} IN (${guest.authSubject},${linked.authSubject})`);
 expect(await cleanExpiredGuests(db,performance.now()+5000)).toEqual({conversations:1});
 await expect(repo.get(guest.authSubject,old.conversation.id)).rejects.toMatchObject({code:'NOT_FOUND'});
 expect((await repo.get(registered.authSubject,saved.conversation.id)).title).toBe('Saved to account');
 expect(await cleanExpiredGuests(db,performance.now()+5000)).toEqual({conversations:0});
});
it('honors existing operator-issued free windows without resetting or overlapping their limits',async()=>{
 const p=await person();
 await db.insert(schema.usageBuckets).values((['PERIOD','DAY'] as const).map(kind=>({userId:p.id,kind,startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+86400000),entitlementVersion:'legacy-reviewed-grant',creditLimit:10,settledCredits:5,providerLimitMicroUsd:100000n})));
 await db.execute(sql`SELECT ensure_free_credits(${p.id}::uuid)`);
 const budgets=await db.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,p.id));
 expect(budgets).toHaveLength(2);expect(budgets.every(b=>b.creditLimit===10&&b.settledCredits===5)).toBe(true);
 expect(await db.select().from(schema.creditGrants).where(eq(schema.creditGrants.userId,p.id))).toEqual([]);
});
