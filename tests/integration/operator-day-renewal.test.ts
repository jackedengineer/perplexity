import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
const pg=new PGlite();
beforeAll(async()=>{
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 for(const entry of journal.entries)await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));
},30000);
afterAll(()=>pg.close());
it('renews one daily window while preserving period spend and unknown holds',async()=>{
 await pg.exec("INSERT INTO operator_usage_buckets(budget_key,kind,starts_at,ends_at,provider_limit_micro_usd,reserved_provider_micro_usd,settled_provider_micro_usd) VALUES ('renewal','PERIOD',now()-interval '2 days',now()+interval '7 days',400000,198184,1816)");
 const before=await pg.query("SELECT * FROM operator_usage_buckets WHERE kind='PERIOD'");
 await Promise.all([pg.query("SELECT ensure_operator_day('renewal')"),pg.query("SELECT ensure_operator_day('renewal')")]);
 expect((await pg.query("SELECT * FROM operator_usage_buckets WHERE kind='PERIOD'")).rows).toEqual(before.rows);
 const {rows}=await pg.query<{provider_limit_micro_usd:number;bounded:boolean}>("SELECT provider_limit_micro_usd,ends_at<=now()+interval '24 hours' AS bounded FROM operator_usage_buckets WHERE kind='DAY'");
 expect(rows).toHaveLength(1);expect(Number(rows[0].provider_limit_micro_usd)).toBe(400000);expect(rows[0].bounded).toBe(true);
});
it('never creates a period or mints capacity for an unknown namespace',async()=>{
 await pg.query("SELECT ensure_operator_day('unprovisioned')");
 expect((await pg.query("SELECT * FROM operator_usage_buckets WHERE budget_key='unprovisioned'")).rows).toEqual([]);
});
it('does not renew expired or exhausted periods or erase their holds',async()=>{
 await pg.exec("INSERT INTO operator_usage_buckets(budget_key,kind,starts_at,ends_at,provider_limit_micro_usd,reserved_provider_micro_usd) VALUES ('expired','PERIOD',now()-interval '2 days',now()-interval '1 day',400000,350001),('exhausted','PERIOD',now()-interval '1 day',now()+interval '1 day',400000,350001)");
 for(const key of ['expired','exhausted']){
  await pg.query('SELECT ensure_operator_day($1)',[key]);
  expect((await pg.query('SELECT kind,reserved_provider_micro_usd FROM operator_usage_buckets WHERE budget_key=$1',[key])).rows).toHaveLength(1);
  expect(Number((await pg.query<{reserved_provider_micro_usd:number}>('SELECT reserved_provider_micro_usd FROM operator_usage_buckets WHERE budget_key=$1',[key])).rows[0].reserved_provider_micro_usd)).toBe(350001);
 }
});
