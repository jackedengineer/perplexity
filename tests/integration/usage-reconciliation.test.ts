import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
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
it('keeps ambiguous usage reserved indefinitely without evidence',async()=>{
 expect(await reconcile()).toBe('UNRESOLVED');
 expect(await db.select().from(schema.runReconciliations)).toHaveLength(0);
 expect((await db.select().from(schema.usageBuckets))[0].reservedProviderMicroUsd).toBe(50000n);
});
it('appends one atomic adjustment in all original buckets without rewriting settlement',async()=>{
 const before=(await db.select().from(schema.runSettlements))[0];await proof();
 expect(await reconcile()).toBe('RECONCILED');expect(await reconcile()).toBe('UNCHANGED');
 expect((await db.select().from(schema.runSettlements))[0]).toEqual(before);
 expect((await db.select().from(schema.runReconciliations))[0]).toMatchObject({version:1,chargedMicroUsd:300n,releasedMicroUsd:49700n,remainingHeldMicroUsd:0n});
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
 expect((await db.select().from(schema.runReconciliations))[0]).toMatchObject({chargedMicroUsd:100n,releasedMicroUsd:0n,remainingHeldMicroUsd:49900n});
 await proof(100n);expect(await reconcile()).toBe('RECONCILED');
 expect((await db.select().from(schema.runReconciliations))[1]).toMatchObject({version:2,chargedMicroUsd:0n,releasedMicroUsd:49900n,remainingHeldMicroUsd:0n});
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
 expect(await db.select().from(schema.runReconciliations)).toHaveLength(1);
});
it('a failed adjustment rolls every bucket change back',async()=>{
 await proof();await pg.exec("CREATE FUNCTION deny_adjustment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$; CREATE TRIGGER deny_adjustment BEFORE INSERT ON run_reconciliations FOR EACH ROW EXECUTE FUNCTION deny_adjustment();");
 try {await expect(reconcile()).rejects.toThrow();expect((await db.select().from(schema.usageBuckets))[0].reservedProviderMicroUsd).toBe(50000n);expect((await db.select().from(schema.operatorUsageBuckets))[0].settledProviderMicroUsd).toBe(0n);}
 finally {await pg.exec('DROP TRIGGER deny_adjustment ON run_reconciliations; DROP FUNCTION deny_adjustment();');}
});
