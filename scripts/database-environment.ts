import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

export function selectDatabaseEnvironment(values: Record<string,string | undefined>, expectedHost: string | undefined) {
  try {
    if (!expectedHost || !/^[a-z0-9.-]+\.neon\.tech$/u.test(expectedHost) || expectedHost.includes('-pooler.')) throw new Error();
    const runtime=new URL(values.DATABASE_URL ?? ''),direct=new URL(values.DATABASE_URL_DIRECT ?? '');
    for(const url of [runtime,direct]) {
      if (!['postgres:','postgresql:'].includes(url.protocol) || url.pathname !== '/perplex' || url.searchParams.get('sslmode') !== 'verify-full' || !url.password) throw new Error();
    }
    if(direct.hostname !== expectedHost || runtime.hostname !== expectedHost.replace('.','-pooler.') || direct.username !== 'perplex_owner' || runtime.username !== 'perplex_web') throw new Error();
    return {DATABASE_URL:values.DATABASE_URL!,DATABASE_URL_DIRECT:values.DATABASE_URL_DIRECT!};
  } catch { throw new Error('Invalid database maintenance target'); }
}
export function databaseEnvironment(env: Record<string,string | undefined> = process.env) {
  if(env.PERPLEX_DB_ENV_FILE) {
    // Explicit maintenance never inherits DB URLs or falls back to development.
    return selectDatabaseEnvironment(parse(readFileSync(env.PERPLEX_DB_ENV_FILE)),env.PERPLEX_DB_EXPECTED_HOST);
  }
  let local: Record<string,string> = {};
  try { local=parse(readFileSync('.env.local')); } catch { /* CI can supply its own environment. */ }
  return {DATABASE_URL:env.DATABASE_URL ?? local.DATABASE_URL,DATABASE_URL_DIRECT:env.DATABASE_URL_DIRECT ?? local.DATABASE_URL_DIRECT};
}
export function hasBudgetProvisioningRights(rights: Record<string,unknown>) {
  return ['budget_create','operator_budget_create','budget_limit_write','provider_limit_write','operator_limit_write'].some(key=>rights[key] !== false);
}
