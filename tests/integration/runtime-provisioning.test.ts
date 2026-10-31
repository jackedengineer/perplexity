import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {runtimePermissionQuery,assertRuntimePermissions} from '../../scripts/database-permissions';

const pg=new PGlite();
beforeAll(async()=>{
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 // Match README's migrate-first, provision-role-second installation order.
 for(const entry of journal.entries)await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));
 await pg.exec('CREATE ROLE perplex_web NOINHERIT NOCREATEDB NOCREATEROLE');
 await pg.exec(await readFile('scripts/runtime-grants.sql','utf8'));
},30000);
afterAll(()=>pg.close());
it('accepts the migrated lifecycle cleanup grants without allowing runtime escalation',async()=>{
 await pg.exec('SET ROLE perplex_web');
 try{
  const {rows}=await pg.query<Record<string,unknown>>(runtimePermissionQuery);
  expect(()=>assertRuntimePermissions(rows[0])).not.toThrow();
  for(const key of ['schema_create','budget_limit_write','operator_limit_write','provider_cap_write','plan_mutation','review_mutation','completion_mutation','evidence_mutation']){
   expect(()=>assertRuntimePermissions({...rows[0],[key]:true})).toThrow();
  }
  expect(()=>assertRuntimePermissions({...rows[0],cleanup_policies:0})).toThrow();
  expect(()=>assertRuntimePermissions({...rows[0],lifecycle_cleanup:false})).toThrow();
  expect(()=>assertRuntimePermissions({})).toThrow();
 }finally{await pg.exec('RESET ROLE');}
});
it('allows renewed availability checks after fresh role provisioning',async()=>{
 await pg.exec('SET ROLE perplex_web');
 try{await pg.query("SELECT ensure_operator_day('unprovisioned-install-check')");}
 finally{await pg.exec('RESET ROLE');}
});
it('allows maintenance recording but not audit deletion or budget escalation',async()=>{
 await pg.exec('SET ROLE perplex_web');
 try{
  await pg.exec("INSERT INTO maintenance_status(name,started_at,outcome) VALUES ('provision-check',now(),'RUNNING')");
  await pg.exec("UPDATE maintenance_status SET outcome='COMPLETED',completed_at=now() WHERE name='provision-check'");
  expect((await pg.query('SELECT outcome FROM maintenance_status')).rows).toEqual([{outcome:'COMPLETED'}]);
  await expect(pg.exec('DELETE FROM maintenance_status')).rejects.toMatchObject({code:'42501'});
  await expect(pg.exec('UPDATE operator_usage_buckets SET provider_limit_micro_usd=999999')).rejects.toMatchObject({code:'42501'});
 }finally{await pg.exec('RESET ROLE');}
});
