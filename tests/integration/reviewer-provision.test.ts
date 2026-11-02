import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {verifyPassword} from 'better-auth/crypto';
import {beforeAll,afterAll,expect,it} from 'vitest';
import {provisionReviewer} from '@/server/auth/provision-reviewer';
import * as schema from '@/db/schema';
const pg=new PGlite(),db=drizzle(pg,{schema});
const origin='https://app.example.test',password='Synthetic-review-only-password';
function policy(email='provisioned@example.test'){
 const now=Date.now();return JSON.stringify({version:1,subject:'reviewer-'+crypto.randomUUID(),email,origin,issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+6*86400000).toISOString()});
}
beforeAll(async()=>{const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const entry of journal.entries)await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));},30000);
afterAll(()=>pg.close());
it('creates only a new, hashed, operator-provisioned reviewer identity without paid grants',async()=>{
 const raw=policy(),result=await provisionReviewer(db,raw,origin,password);
 const [account]=await db.select().from(schema.account).where(eq(schema.account.userId,result.subject));
 expect(account.providerId).toBe('credential');expect(account.accountId).toBe(result.subject);expect(account.password).not.toBe(password);
 expect(await verifyPassword({hash:account.password!,password})).toBe(true);
 const [user]=await db.select().from(schema.user).where(eq(schema.user.id,result.subject));
 expect(user.createdAt.toISOString()).toBe(result.issuedAt);expect(user.isAnonymous).toBe(false);
 expect(await db.select().from(schema.jobPeriods)).toEqual([]);expect(await db.select().from(schema.billingCheckouts)).toEqual([]);
});
it('never attaches credentials to an existing email or overwrites an existing reviewer',async()=>{
 await db.insert(schema.user).values({id:'existing-google-user',name:'Existing',email:'Existing@Example.test',emailVerified:true});
 await expect(provisionReviewer(db,policy('existing@example.test'),origin,password)).rejects.toThrow('already exists');
 expect(await db.select().from(schema.account).where(eq(schema.account.userId,'existing-google-user'))).toEqual([]);
});
it('rolls back the new identity if credential persistence fails',async()=>{
 const raw=policy('rollback@example.test'),id=JSON.parse(raw).subject;
 await pg.exec("ALTER TABLE account ADD CONSTRAINT reject_fixture_credentials CHECK (provider_id <> 'credential') NOT VALID");
 try{await expect(provisionReviewer(db,raw,origin,password)).rejects.toThrow();expect(await db.select().from(schema.user).where(eq(schema.user.id,id))).toEqual([]);}
 finally{await pg.exec('ALTER TABLE account DROP CONSTRAINT reject_fixture_credentials');}
});
it('rejects malformed or wrong-origin configuration before writing',async()=>{
 await expect(provisionReviewer(db,policy(),'https://other.example.test',password)).rejects.toThrow('configuration');
 await expect(provisionReviewer(db,'{}',origin,password)).rejects.toThrow('configuration');
});
