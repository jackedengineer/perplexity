import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq,inArray,sql } from 'drizzle-orm';
import { beforeAll,beforeEach,afterAll,expect,it } from 'vitest';
import * as schema from '@/db/schema';
import { seedCompletion } from '../helpers/completion';
import { createFinalization } from '@/server/runs/finalize';
import { createUsageReconciliation } from '@/server/runs/reconcile';
const pg=new PGlite(),db=drizzle(pg,{schema});
let person:Awaited<ReturnType<typeof seedCompletion>>,callId:string;
beforeAll(async()=>{const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const e of journal.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,'utf8'));});
beforeEach(async()=>{
 await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);person=await seedCompletion(db);
 const [call]=await db.insert(schema.providerCalls).values({runId:person.runId,stage:'INPUT_SAFETY',attemptVersion:1,requestedModel:'test/safety',capMicroUsd:5000n,status:'STARTED',startedAt:new Date()}).returning();callId=call.id;
 await createFinalization(db).fail(person.subject,person.runId,'PROVIDER_UNAVAILABLE');
});
afterAll(()=>pg.close());
const reconcile=()=>createUsageReconciliation(db).reconcile(person.subject,person.runId);
const proof=(cost=300n)=>db.insert(schema.providerUsageResolutions).values({callId,runId:person.runId,costMicroUsd:cost,kind:'PROVIDER_RECEIPT',evidenceHash:'b'.repeat(64)});
it('keeps the most an ambiguous call could cost reserved indefinitely without evidence',async()=>{
 expect(await reconcile()).toBe('UNRESOLVED');
 expect(await db.select().from(schema.runReconciliations)).toHaveLength(0);
 expect((await db.select().from(schema.runSettlements))[0]).toMatchObject({heldProviderMicroUsd:5000n,releasedProviderMicroUsd:45000n});
 expect((await db.select().from(schema.usageBuckets))[0].reservedProviderMicroUsd).toBe(5000n);
});
it('appends one atomic adjustment in all original buckets without rewriting settlement',async()=>{
 const before=(await db.select().from(schema.runSettlements))[0];await proof();
 expect(await reconcile()).toBe('RECONCILED');expect(await reconcile()).toBe('UNCHANGED');
 expect((await db.select().from(schema.runSettlements))[0]).toEqual(before);
 expect((await db.select().from(schema.runReconciliations))[0]).toMatchObject({version:1,chargedMicroUsd:300n,releasedMicroUsd:4700n,remainingHeldMicroUsd:0n});
 expect((await db.select().from(schema.usageBuckets)).every(b=>b.reservedProviderMicroUsd===0n&&b.settledProviderMicroUsd===300n&&b.settledCredits===0)).toBe(true);
 expect((await db.select().from(schema.operatorUsageBuckets)).every(b=>b.reservedProviderMicroUsd===0n&&b.settledProviderMicroUsd===300n)).toBe(true);
});
it('a late successful recorded usage result resolves without a new provider call',async()=>{
 await db.update(schema.providerCalls).set({status:'SUCCEEDED',costMicroUsd:700n,finishedAt:new Date()}).where(eq(schema.providerCalls.id,callId));
 expect(await reconcile()).toBe('RECONCILED');
 expect((await db.select().from(schema.runReconciliations))[0].chargedMicroUsd).toBe(700n);
});
it('unknown outcomes with known partial usage stay held until an operator confirms billing',async()=>{
 await db.update(schema.providerCalls).set({status:'UNKNOWN',costMicroUsd:100n,finishedAt:new Date()}).where(eq(schema.providerCalls.id,callId));
 expect(await reconcile()).toBe('RECONCILED');
 expect((await db.select().from(schema.runReconciliations))[0]).toMatchObject({chargedMicroUsd:100n,releasedMicroUsd:0n,remainingHeldMicroUsd:4900n});
 await proof(100n);expect(await reconcile()).toBe('RECONCILED');
 expect((await db.select().from(schema.runReconciliations))[1]).toMatchObject({version:2,chargedMicroUsd:0n,releasedMicroUsd:4900n,remainingHeldMicroUsd:0n});
});
it('resolves against expired original windows rather than current grants',async()=>{
 await db.update(schema.usageBuckets).set({endsAt:new Date(Date.now()-1000)});await db.update(schema.operatorUsageBuckets).set({endsAt:new Date(Date.now()-1000)});
 await proof(0n);expect(await reconcile()).toBe('RECONCILED');
 expect((await db.select().from(schema.usageBuckets))[0].reservedProviderMicroUsd).toBe(0n);
});
it('foreign ownership and over-cap evidence cannot change balances',async()=>{
 await expect(createUsageReconciliation(db).reconcile('foreign',person.runId)).rejects.toThrow();
 await proof(5001n);await expect(reconcile()).rejects.toThrow();
 expect(await db.select().from(schema.runReconciliations)).toHaveLength(0);
});
it('legacy accounting never becomes a zero-cost refund',async()=>{
 await db.update(schema.runs).set({accountingVersion:0}).where(eq(schema.runs.id,person.runId));await proof(0n);
 expect(await reconcile()).toBe('UNRESOLVED');expect(await db.select().from(schema.runReconciliations)).toHaveLength(0);
});

it('contradictory late billing after verified release is reported rather than silently ignored',async()=>{
 await proof(0n);await reconcile();
 await db.update(schema.providerCalls).set({status:'SUCCEEDED',costMicroUsd:100n,finishedAt:new Date()}).where(eq(schema.providerCalls.id,callId));
 await expect(reconcile()).rejects.toThrow();
 expect(await createUsageReconciliation(db).sweep()).toEqual({scanned:1,reconciled:0,failed:1});
 expect(await db.select().from(schema.runReconciliations)).toHaveLength(1);
});
it('a failed adjustment rolls every bucket change back',async()=>{
 await proof();await pg.exec("CREATE FUNCTION deny_adjustment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$; CREATE TRIGGER deny_adjustment BEFORE INSERT ON run_reconciliations FOR EACH ROW EXECUTE FUNCTION deny_adjustment();");
 try {await expect(reconcile()).rejects.toThrow();expect((await db.select().from(schema.usageBuckets))[0].reservedProviderMicroUsd).toBe(5000n);expect((await db.select().from(schema.operatorUsageBuckets))[0].settledProviderMicroUsd).toBe(0n);}
 finally {await pg.exec('DROP TRIGGER deny_adjustment ON run_reconciliations; DROP FUNCTION deny_adjustment();');}
});
it('the bounded sweep skips unresolved holds and applies actionable receipts once',async()=>{
 expect(await createUsageReconciliation(db).sweep()).toEqual({scanned:0,reconciled:0,failed:0});
 await proof();expect(await createUsageReconciliation(db).sweep()).toEqual({scanned:1,reconciled:1,failed:0});
 expect(await createUsageReconciliation(db).sweep()).toEqual({scanned:0,reconciled:0,failed:0});
});

// A hold from before exposure-based settlement: the whole reserve minus known cost.
const restoreWholeReserveHold=async(runId=person.runId,held=50000n)=>{
 const [before]=await db.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,runId));const extra=held-before.heldProviderMicroUsd;
 const [hold]=await db.select().from(schema.usageReservations).where(eq(schema.usageReservations.runId,runId));
 await db.update(schema.runSettlements).set({heldProviderMicroUsd:held,releasedProviderMicroUsd:0n}).where(eq(schema.runSettlements.runId,runId));
 await db.update(schema.usageBuckets).set({reservedProviderMicroUsd:sql`${schema.usageBuckets.reservedProviderMicroUsd}+${extra}`}).where(inArray(schema.usageBuckets.id,[hold.periodBucketId,hold.dayBucketId]));
 await db.update(schema.operatorUsageBuckets).set({reservedProviderMicroUsd:sql`${schema.operatorUsageBuckets.reservedProviderMicroUsd}+${extra}`}).where(inArray(schema.operatorUsageBuckets.id,[hold.operatorPeriodBucketId,hold.operatorDayBucketId]));
};
it('the sweep shrinks an old whole-reserve hold to its exposure without a receipt, then a receipt clears the rest',async()=>{
 await restoreWholeReserveHold();
 expect(await createUsageReconciliation(db).sweep()).toEqual({scanned:1,reconciled:1,failed:0});
 expect((await db.select().from(schema.runReconciliations))[0]).toMatchObject({version:1,previousHeldMicroUsd:50000n,chargedMicroUsd:0n,releasedMicroUsd:45000n,remainingHeldMicroUsd:5000n});
 expect((await db.select().from(schema.operatorUsageBuckets)).every(b=>b.reservedProviderMicroUsd===5000n&&b.settledProviderMicroUsd===0n)).toBe(true);
 expect(await createUsageReconciliation(db).sweep()).toEqual({scanned:0,reconciled:0,failed:0});
 await proof(300n);expect(await createUsageReconciliation(db).sweep()).toEqual({scanned:1,reconciled:1,failed:0});
 expect((await db.select().from(schema.runReconciliations))[1]).toMatchObject({version:2,previousHeldMicroUsd:5000n,chargedMicroUsd:300n,releasedMicroUsd:4700n,remainingHeldMicroUsd:0n});
 expect((await db.select().from(schema.operatorUsageBuckets)).every(b=>b.reservedProviderMicroUsd===0n&&b.settledProviderMicroUsd===300n)).toBe(true);
});
const twoUnresolvedCalls=async()=>{
 const other=await seedCompletion(db);const calls=await db.insert(schema.providerCalls).values([
  {runId:other.runId,stage:'INPUT_SAFETY',attemptVersion:1,requestedModel:'test/safety',capMicroUsd:5000n,status:'STARTED',startedAt:new Date()},
  {runId:other.runId,stage:'SEARCH',attemptVersion:1,requestedModel:'tavily/basic',capMicroUsd:8000n,status:'STARTED',startedAt:new Date()},
 ]).returning();
 await createFinalization(db).fail(other.subject,other.runId,'PROVIDER_UNAVAILABLE');
 return {other,calls};
};
const receipt=(runId:string,callId:string,cost:bigint)=>db.insert(schema.providerUsageResolutions).values({callId,runId,costMicroUsd:cost,kind:'PROVIDER_RECEIPT',evidenceHash:'c'.repeat(64)});
const reconciliations=(runId:string)=>db.select().from(schema.runReconciliations).where(eq(schema.runReconciliations.runId,runId)).orderBy(schema.runReconciliations.version);
it('one receipt settles only its own call: the other call stays held at its full cap',async()=>{
 const {other,calls}=await twoUnresolvedCalls();
 expect((await db.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,other.runId)))[0]).toMatchObject({heldProviderMicroUsd:13000n,releasedProviderMicroUsd:37000n});
 await receipt(other.runId,calls[0].id,1000n);
 expect(await createUsageReconciliation(db).reconcile(other.subject,other.runId)).toBe('RECONCILED');
 expect((await reconciliations(other.runId))[0]).toMatchObject({previousHeldMicroUsd:13000n,chargedMicroUsd:1000n,releasedMicroUsd:4000n,remainingHeldMicroUsd:8000n});
});
it('an old whole-reserve hold with a late charge books it and keeps the other call covered',async()=>{
 const {other,calls}=await twoUnresolvedCalls();await restoreWholeReserveHold(other.runId);
 await receipt(other.runId,calls[0].id,1000n);
 expect(await createUsageReconciliation(db).reconcile(other.subject,other.runId)).toBe('RECONCILED');
 expect((await reconciliations(other.runId))[0]).toMatchObject({previousHeldMicroUsd:50000n,chargedMicroUsd:1000n,releasedMicroUsd:41000n,remainingHeldMicroUsd:8000n});
});
it('a receipt above a priced call\'s reported cost changes no balance and is reported as a failure',async()=>{
 const other=await seedCompletion(db);const [priced,open]=await db.insert(schema.providerCalls).values([
  {runId:other.runId,stage:'ANSWER',attemptVersion:1,requestedModel:'test/answer',capMicroUsd:20000n,status:'SUCCEEDED',costMicroUsd:1000n,startedAt:new Date(),finishedAt:new Date()},
  {runId:other.runId,stage:'SEARCH',attemptVersion:1,requestedModel:'tavily/basic',capMicroUsd:8000n,status:'UNKNOWN',startedAt:new Date(),finishedAt:new Date()},
 ]).returning();expect(open.id).toBeTruthy();
 await createFinalization(db).fail(other.subject,other.runId,'PROVIDER_UNAVAILABLE');
 await receipt(other.runId,priced.id,3000n);
 await expect(createUsageReconciliation(db).reconcile(other.subject,other.runId)).rejects.toThrow();
 expect(await createUsageReconciliation(db).sweep()).toMatchObject({failed:1});
 expect(await reconciliations(other.runId)).toHaveLength(0);
 expect((await db.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,other.runId)))[0]).toMatchObject({knownProviderMicroUsd:1000n,heldProviderMicroUsd:8000n});
});
it('never holds more than the unspent reserve, so inconsistent old caps cannot block settlement',async()=>{
 const other=await seedCompletion(db,10000n);
 await db.insert(schema.providerCalls).values([{runId:other.runId,stage:'INPUT_SAFETY',attemptVersion:1,requestedModel:'test/safety',capMicroUsd:5000n,status:'UNKNOWN',startedAt:new Date(),finishedAt:new Date()},{runId:other.runId,stage:'SEARCH',attemptVersion:1,requestedModel:'tavily/basic',capMicroUsd:8000n,status:'UNKNOWN',startedAt:new Date(),finishedAt:new Date()}]);
 await createFinalization(db).fail(other.subject,other.runId,'PROVIDER_UNAVAILABLE');
 expect((await db.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,other.runId)))[0]).toMatchObject({heldProviderMicroUsd:10000n,releasedProviderMicroUsd:0n});
 expect(await createUsageReconciliation(db).reconcile(other.subject,other.runId)).toBe('UNRESOLVED');
});
it('legacy accounting still settles by holding the whole unspent reserve',async()=>{
 const other=await seedCompletion(db);await db.update(schema.runs).set({accountingVersion:0}).where(eq(schema.runs.id,other.runId));
 await createFinalization(db).fail(other.subject,other.runId,'PROVIDER_UNAVAILABLE');
 expect((await db.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,other.runId)))[0]).toMatchObject({heldProviderMicroUsd:50000n,releasedProviderMicroUsd:0n});
});
