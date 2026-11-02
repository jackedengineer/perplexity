import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {parse} from 'dotenv';
import {databaseEnvironment} from './database-environment';
import {reviewerConfiguration} from '../src/lib/reviewer-policy';
import {provisionReviewer} from '../src/server/auth/provision-reviewer';
import * as schema from '../src/db/schema';

async function main(){
  // No implicit development/production fallback for identity maintenance.
  if(!process.env.PERPLEX_DB_ENV_FILE||!process.env.PERPLEX_DB_EXPECTED_HOST||!process.env.REVIEWER_PROVISION_FILE||!process.env.REVIEWER_EXPECTED_ORIGIN)throw new Error('Explicit maintenance inputs required');
  const path=process.env.REVIEWER_PROVISION_FILE;
  if((statSync(path).mode&0o077)!==0)throw new Error('Private reviewer input must have mode 0600');
  const values=parse(readFileSync(path)),raw=values.REVIEWER_LOGIN_CONFIG,origin=process.env.REVIEWER_EXPECTED_ORIGIN;
  const policy=reviewerConfiguration(raw,origin),target=databaseEnvironment();
  if(!policy||!values.REVIEWER_PASSWORD||!target.DATABASE_URL_DIRECT)throw new Error('Invalid private reviewer configuration');
  if(!process.argv.includes('--apply')){console.info(JSON.stringify({event:'reviewer.provision',outcome:'DRY_RUN',expiresAt:policy.expiresAt}));return;}
  const pool=new Pool({connectionString:target.DATABASE_URL_DIRECT,max:1,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:10000});
  pool.on('error',()=>console.error(JSON.stringify({event:'reviewer.database',outcome:'UNAVAILABLE'})));
  try{
    await provisionReviewer(drizzle(pool,{schema}),raw,origin,values.REVIEWER_PASSWORD);
    // Receipt contains the activation binding, never the password or database URL.
    writeFileSync(path+'.receipt',JSON.stringify({created:true,configuration:policy},null,2),{mode:0o600,flag:'wx'});
    console.info(JSON.stringify({event:'reviewer.provision',outcome:'CREATED',expiresAt:policy.expiresAt}));
  }finally{await pool.end();}
}
main().catch(()=>{console.error(JSON.stringify({event:'reviewer.provision',outcome:'FAILED'}));process.exitCode=1;});
