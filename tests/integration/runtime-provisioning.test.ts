import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {runtimePermissionQuery,assertRuntimePermissions} from '../../scripts/database-permissions';
import {randomUUID} from 'node:crypto';
import {drizzle} from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import {applyOperations,deleteAllMemories,getSettings,listMemories,loadReader,updateSettings} from '@/server/memory/store';
import {extractMemories} from '@/server/memory/run';

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
it('grants narrow paid-content cleanup functions without raw deletion or undelete privileges',async()=>{
 const {rows}=await pg.query(`SELECT
  has_function_privilege('perplex_web','public.perplex_delete_job_content(uuid,text)','EXECUTE') AS erase,
  has_function_privilege('perplex_web','public.perplex_prune_job_evidence()','EXECUTE') AS prune,
  has_table_privilege('perplex_web','public.job_checkpoints','DELETE') AS raw_delete,
  has_column_privilege('perplex_web','public.durable_jobs','deleted_at','UPDATE') AS undelete`);
 expect(rows[0]).toEqual({erase:true,prune:true,raw_delete:false,undelete:false});
});
it('lets the web role rewrite memory content but never its owner, source or ledger cost history',async()=>{
 const {rows}=await pg.query(`SELECT
  has_table_privilege('perplex_web','public.memories','DELETE') AS forget,
  has_column_privilege('perplex_web','public.memories','text','UPDATE') AS rewrite,
  has_column_privilege('perplex_web','public.memories','user_id','UPDATE') AS reassign,
  has_column_privilege('perplex_web','public.memories','source_message_id','UPDATE') AS resource,
  has_column_privilege('perplex_web','public.memory_settings','user_id','UPDATE') AS settings_owner,
  has_table_privilege('perplex_web','public.memory_extractions','DELETE') AS erase_ledger,
  has_column_privilege('perplex_web','public.memory_extractions','user_id','UPDATE') AS ledger_owner`);
 expect(rows[0]).toEqual({forget:true,rewrite:true,reassign:false,resource:false,settings_owner:false,erase_ledger:false,ledger_owner:false});
});
it('runs every memory query as the web role',async()=>{
 const db=drizzle(pg,{schema}),subject=randomUUID();
 await db.insert(schema.user).values({id:subject,name:'Reader',email:`${subject}@example.test`});
 const [profile]=await db.insert(schema.appUsers).values({authSubject:subject}).returning();
 const [conversation]=await db.insert(schema.conversations).values({userId:profile.id,creationRequestId:randomUUID(),creationFingerprint:'synthetic',title:'Memory'}).returning();
 await pg.exec('SET ROLE perplex_web');
 try{
  await updateSettings(db,subject,{instructions:'Metric units'});
  await updateSettings(db,subject,{paused:false});
  expect(await getSettings(db,subject)).toEqual({paused:false,instructions:'Metric units'});
  expect(await applyOperations(db,profile.id,[{op:'ADD',kind:'PROFILE',text:'Lives in Pune'}],null,new Date())).toBe(1);
  const [memory]=await listMemories(db,profile.id);
  expect(await applyOperations(db,profile.id,[{op:'UPDATE',id:memory.id,text:'Lives in Delhi'}],null)).toBe(1);
  expect(await loadReader(db,profile.id,conversation.id)).toEqual({instructions:'Metric units',memories:['Lives in Delhi'],learning:true});
  const log=(event:Record<string,unknown>)=>{if(event.outcome==='ERROR')throw new Error('extraction query failed');};
  await extractMemories(db,randomUUID(),{modelId:'test/memory',extract:async()=>({operations:[],usage:undefined})},{log});
  expect(await deleteAllMemories(db,subject)).toBe(1);
 }finally{await pg.exec('RESET ROLE');}
});
