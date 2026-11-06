// Privileged maintenance only. Never installed in the application runtime.
// Dry run by default; pass --apply to write. Renew the provider key first: the period can't outlive it.
import {parseArgs} from 'node:util';
import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';
import {Pool} from 'pg';
import {databaseEnvironment} from './database-environment.ts';
import {renewOperatorWindow,renewalEnd} from './operator-renewal.mjs';
const {values}=parseArgs({options:{apply:{type:'boolean'}}});
if(!process.env.PERPLEX_DB_ENV_FILE)throw new Error('Explicit maintenance environment required');
const env=parse(readFileSync(process.env.PERPLEX_DB_ENV_FILE)),target=databaseEnvironment();
const response=await fetch('https://openrouter.ai/api/v1/key',{
 headers:{Authorization:`Bearer ${env.OPENROUTER_API_KEY}`},signal:AbortSignal.timeout(10000),
});
if(!response.ok)throw new Error('Provider key metadata unavailable');
const {data:key}=await response.json();
const endsAt=renewalEnd(key);
const pool=new Pool({connectionString:target.DATABASE_URL_DIRECT,max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
try {
 const c=await pool.connect();
 try {
  const result=await renewOperatorWindow(c,{budgetKey:env.RUN_OPERATOR_BUDGET_KEY,endsAt,apply:Boolean(values.apply)});
  console.log(JSON.stringify({...result,keyRemainingUsd:key.limit_remaining}));
 }finally{c.release();}
}finally{await pool.end();}
