// Privileged maintenance only. Never installed in the application runtime.
import {parseArgs} from 'node:util';
import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';
import {Pool} from 'pg';
import {databaseEnvironment} from './database-environment.ts';
const {values}=parseArgs({options:{apply:{type:'boolean'}}});
if(!process.env.PERPLEX_DB_ENV_FILE)throw new Error('Explicit maintenance environment required');
const env=parse(readFileSync(process.env.PERPLEX_DB_ENV_FILE)),target=databaseEnvironment();
const response=await fetch('https://openrouter.ai/api/v1/key',{
 headers:{Authorization:`Bearer ${env.OPENROUTER_API_KEY}`},signal:AbortSignal.timeout(10000),
});
if(!response.ok)throw new Error('Provider key metadata unavailable');
const {data:key}=await response.json();
if(typeof key.limit!=='number'||!Number.isFinite(key.limit)||key.limit<=0||key.limit>2||key.limit_reset!==null||!Number.isFinite(key.limit_remaining)||key.limit_remaining<0.05)throw new Error('Expected non-resetting key capped at $2 or less with reservation capacity');
const expiry=new Date(key.expires_at).getTime();
if(!Number.isFinite(expiry)||expiry<=Date.now()+60000)throw new Error('Key expiry must be renewed first');
const endsAt=new Date(Math.min(expiry,Date.now()+7*86400000));
const pool=new Pool({connectionString:target.DATABASE_URL_DIRECT,max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
try {
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  await c.query("SELECT pg_advisory_xact_lock(hashtext('perplex:operator-renewal'))");
  const {rows}=await c.query('SELECT * FROM operator_usage_buckets WHERE budget_key=$1 ORDER BY ends_at DESC FOR UPDATE',[env.RUN_OPERATOR_BUDGET_KEY]);
  const period=rows.find(r=>r.kind==='PERIOD');
  if(!period||BigInt(period.provider_limit_micro_usd)!==400000n)throw new Error('Review existing period ceiling before renewal');
  if(rows.filter(r=>r.kind==='PERIOD'&&new Date(r.ends_at)>new Date()).length>1)throw new Error('Overlapping period windows');
  const available=400000n-BigInt(period.reserved_provider_micro_usd)-BigInt(period.settled_provider_micro_usd);
  if(available<50000n)throw new Error('Reconcile verified receipts before renewing exhausted capacity');
  const days=rows.filter(r=>r.kind==='DAY'&&new Date(r.ends_at)>new Date());
  if(days.length>1)throw new Error('Overlapping day windows');
  if(values.apply) {
   // Preserve the existing period identity, reservations, settled spend and ceiling.
   await c.query('UPDATE operator_usage_buckets SET ends_at=$1 WHERE id=$2',[endsAt,period.id]);
   if(!days.length)await c.query("INSERT INTO operator_usage_buckets (budget_key,kind,starts_at,ends_at,provider_limit_micro_usd) VALUES ($1,'DAY',clock_timestamp(),$2,400000)",[env.RUN_OPERATOR_BUDGET_KEY,new Date(Math.min(endsAt.getTime(),Date.now()+86400000))]);
   else await c.query('UPDATE operator_usage_buckets SET ends_at=$1 WHERE id=$2',[new Date(Math.min(endsAt.getTime(),Date.now()+86400000)),days[0].id]);
  }
  console.log(JSON.stringify({applied:Boolean(values.apply),endsAt,periodAvailableMicroUsd:available.toString(),keyRemainingUsd:key.limit_remaining,existingSpendAndHoldsPreserved:true}));
  await c.query(values.apply?'COMMIT':'ROLLBACK');
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}finally{await pool.end();}
