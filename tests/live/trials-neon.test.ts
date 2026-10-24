import { afterAll,beforeAll,expect,it } from 'vitest';
import { eq,sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { createNeonFixture,simultaneously } from './admission-fixture';
import { createRunAdmission } from '@/server/runs/admit';
import { readUsage } from '@/server/billing/usage';
import { linkGuest } from '@/server/billing/link-guest';
const f=createNeonFixture();
beforeAll(()=>f.budgets(1000000n));afterAll(()=>f.close());
it('restricted runtime grants fixed credits, admits once and links without budget-write privileges',async()=>{
 const p=await f.identity(),target=await f.identity();
 // Replace only these fixture-owned manual grants with the production fixed policy.
 await f.owner.delete(schema.usageBuckets).where(sql`${schema.usageBuckets.userId} IN (${p.profile.id},${target.profile.id})`);
 await f.owner.update(schema.user).set({isAnonymous:true}).where(eq(schema.user.id,p.subject));
 await f.owner.update(schema.user).set({emailVerified:true}).where(eq(schema.user.id,target.subject));
 const rights=await f.runtimePool.query(`SELECT
  has_table_privilege(current_user,'credit_ledger','INSERT') AS ledger_write,
  has_table_privilege(current_user,'credit_grants','INSERT') AS grant_write,
  has_column_privilege(current_user,'usage_buckets','credit_limit','UPDATE') AS limit_write,
  has_function_privilege(current_user,'ensure_free_credits(uuid)','EXECUTE') AS grant_call`);
 expect(rights.rows[0]).toEqual({ledger_write:false,grant_write:false,limit_write:false,grant_call:true});
 expect((await readUsage(f.runtime,p.subject)).period.remaining).toBe(6);
 const admission=createRunAdmission(f.runtime,f.keys,f.policy,undefined,true),request={...p.request,modelKey:'economy-nano'};
 const results=await simultaneously([()=>admission.admit(p.subject,request),()=>admission.admit(p.subject,request)]);
 expect(results.map(r=>r.kind).sort()).toEqual(['ADMITTED','RUN_IN_PROGRESS']);
 const [run]=await f.runtime.select().from(schema.runs).where(eq(schema.runs.userId,p.profile.id));
 expect((await readUsage(f.runtime,p.subject)).period.reserved).toBe(2);
 await linkGuest(f.runtime,p.subject,target.subject);
 expect((await readUsage(f.runtime,target.subject)).period.remaining).toBe(40);
 expect((await f.runtime.select().from(schema.creditLedger).where(eq(schema.creditLedger.runId,run.id))).map(l=>l.kind).sort()).toEqual(['CHARGE','RELEASE','RESERVE']);
 expect((await f.runtime.select().from(schema.runs).where(eq(schema.runs.id,run.id)))[0]).toMatchObject({userId:target.profile.id,status:'CANCELLED'});
 await expect(f.runtime.execute(sql`SELECT ensure_free_credits(${p.profile.id}::uuid)`)).rejects.toThrow();
});
