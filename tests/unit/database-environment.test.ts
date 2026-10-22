import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { selectDatabaseEnvironment, hasBudgetProvisioningRights, databaseEnvironment } from '../../scripts/database-environment';
const host='ep-production.ap-southeast-1.aws.neon.tech';
const env={ DATABASE_URL:`postgresql://perplex_web:example@${host.replace('.','-pooler.')}/perplex?sslmode=verify-full`,DATABASE_URL_DIRECT:`postgresql://perplex_owner:example@${host}/perplex?sslmode=verify-full` };
it('uses only the explicit file even when inherited database variables point elsewhere',()=>{
 expect(selectDatabaseEnvironment(env,host)).toEqual(env);
});
it.each([{}, {DATABASE_URL:env.DATABASE_URL}, {...env,DATABASE_URL_DIRECT:env.DATABASE_URL_DIRECT.replace('ep-production','ep-development')}, {...env,DATABASE_URL:env.DATABASE_URL.replace('verify-full','require')}])('rejects incomplete, mixed or unverified production targets',values=>{
 expect(()=>selectDatabaseEnvironment(values,host)).toThrow('Invalid database maintenance target');
});
it('requires the expected production host before selecting an explicit environment',()=>{
 expect(()=>selectDatabaseEnvironment(env,undefined)).toThrow();
});
it.each(['budget_create','operator_budget_create','budget_limit_write','provider_limit_write','operator_limit_write'])('rejects unexpected budget permission %s',key=>{
 expect(hasBudgetProvisioningRights({budget_create:false,operator_budget_create:false,budget_limit_write:false,provider_limit_write:false,operator_limit_write:false,[key]:true})).toBe(true);
});

it('explicit maintenance overrides inherited URLs and rejects missing file fields',()=>{
 const dir=mkdtempSync(join(tmpdir(),'perplex-db-'));
 const file=join(dir,'launch.env');
 const inherited={PERPLEX_DB_ENV_FILE:file,PERPLEX_DB_EXPECTED_HOST:host,DATABASE_URL:'postgresql://wrong',DATABASE_URL_DIRECT:'postgresql://wrong'};
 try {
  writeFileSync(file,Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n'));
  expect(databaseEnvironment(inherited)).toEqual(env);
  writeFileSync(file,`DATABASE_URL=${env.DATABASE_URL}`);
  expect(()=>databaseEnvironment(inherited)).toThrow();
 } finally {rmSync(dir,{recursive:true});}
});
it('missing permission results fail closed',()=>expect(hasBudgetProvisioningRights({})).toBe(true));
