import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { Pool } from 'pg';
import { databaseEnvironment } from './database-environment.ts';
const receiptSchema=z.strictObject({callId:z.uuid(),runId:z.uuid(),costMicroUsd:z.string().regex(/^\d{1,6}$/u),
 kind:z.enum(['PROVIDER_RECEIPT','VERIFIED_NOT_BILLED']),evidenceHash:z.string().regex(/^[a-f0-9]{64}$/u)})
 .refine(v=>BigInt(v.costMicroUsd)<=150000n&&(v.kind!=='VERIFIED_NOT_BILLED'||BigInt(v.costMicroUsd)===0n));
// Operator supplies metadata/hash of a manually inspected provider receipt, not raw content.
// Owner credentials are never installed in the hosted application or exposed by HTTP.
let pool;
try {
 const {values}=parseArgs({options:{receipt:{type:'string'},'verified-receipt':{type:'boolean'}}});
 if(!values.receipt||!values['verified-receipt']||!process.env.PERPLEX_DB_ENV_FILE)throw new Error('Explicit verified receipt and maintenance environment required');
 const bytes=readFileSync(values.receipt);if(bytes.byteLength>2048)throw new Error('Receipt metadata exceeds limit');
 const receipt=receiptSchema.parse(JSON.parse(bytes.toString('utf8'))),env=databaseEnvironment();
 pool=new Pool({connectionString:env.DATABASE_URL_DIRECT,max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const {rows}=await client.query(`SELECT c.cap_micro_usd,c.cost_micro_usd,r.status FROM provider_calls c JOIN runs r ON r.id=c.run_id WHERE c.id=$1 AND c.run_id=$2 FOR UPDATE OF c`,[receipt.callId,receipt.runId]);
  const call=rows[0];if(!call||['RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT'].includes(call.status)||BigInt(receipt.costMicroUsd)>BigInt(call.cap_micro_usd)||BigInt(receipt.costMicroUsd)<BigInt(call.cost_micro_usd??0))throw new Error('Receipt does not match a terminal provider call');
  const existing=await client.query('SELECT cost_micro_usd,kind,evidence_hash FROM provider_usage_resolutions WHERE call_id=$1',[receipt.callId]);
  if(existing.rows.length) {
   const saved=existing.rows[0];if(BigInt(saved.cost_micro_usd)!==BigInt(receipt.costMicroUsd)||saved.kind!==receipt.kind||saved.evidence_hash!==receipt.evidenceHash)throw new Error('Conflicting immutable receipt');
  }else await client.query('INSERT INTO provider_usage_resolutions (call_id,run_id,cost_micro_usd,kind,evidence_hash) VALUES ($1,$2,$3,$4,$5)',[receipt.callId,receipt.runId,receipt.costMicroUsd,receipt.kind,receipt.evidenceHash]);
  await client.query('COMMIT');console.log(JSON.stringify({event:'usage.resolution_recorded',duplicate:existing.rows.length===1}));
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}catch{console.error(JSON.stringify({event:'usage.resolution_failed'}));process.exitCode=1;}finally{await pool?.end();}
