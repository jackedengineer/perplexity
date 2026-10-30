import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,expect,it,vi} from 'vitest';
import {createNeonFixture} from './admission-fixture';

const f=createNeonFixture();
afterEach(()=>f.cleanup());
afterAll(()=>f.close());
it('renews and loads budgets without inverting settlement row locks',async()=>{
 const day=`00000000-${randomUUID().slice(9)}`,period=`ffffffff-${randomUUID().slice(9)}`;
 await f.ownerPool.query(`INSERT INTO operator_usage_buckets(id,budget_key,kind,starts_at,ends_at,provider_limit_micro_usd)
  VALUES ($1,$3,'DAY',now()-interval '1 hour',now()+interval '1 day',400000),
         ($2,$3,'PERIOD',now()-interval '1 hour',now()+interval '7 days',400000)`,[day,period,f.namespace]);
 const settlement=await f.ownerPool.connect(),admission=await f.runtimePool.connect();
 let loading:Promise<unknown>|undefined;
 try{
  await settlement.query('BEGIN');await admission.query('BEGIN');
  await settlement.query('SELECT id FROM operator_usage_buckets WHERE id=$1 FOR UPDATE',[day]);
  const pid=(await admission.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  loading=(async()=>{
   await admission.query('SELECT ensure_operator_day($1)',[f.namespace]);
   await admission.query('SELECT id FROM operator_usage_buckets WHERE budget_key=$1 ORDER BY id FOR UPDATE',[f.namespace]);
  })().catch(error=>error);
  // Ensure admission is contending with settlement before requesting PERIOD.
  await vi.waitFor(async()=>expect((await f.ownerPool.query('SELECT cardinality(pg_blocking_pids($1)) AS blockers',[pid])).rows[0].blockers).toBeGreaterThan(0),{timeout:5000,interval:20});
  let settlementError:unknown;
  try{await settlement.query('SELECT id FROM operator_usage_buckets WHERE id=$1 FOR UPDATE',[period]);}
  catch(error){settlementError=error;}
  await settlement.query('ROLLBACK');
  const admissionError=await loading;
  expect(settlementError).toBeUndefined();expect(admissionError).toBeUndefined();
 }finally{
  await settlement.query('ROLLBACK');await loading;await admission.query('ROLLBACK');
  settlement.release();admission.release();
 }
},30000);
