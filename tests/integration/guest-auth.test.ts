import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
import * as schema from '@/db/schema';
import {createAuth} from '@/lib/auth-factory';
import {guestSignIn,trustedGuestAddress} from '@/server/auth/guest';
const pg=new PGlite(),db=drizzle(pg,{schema});
const env={NODE_ENV:'test' as const,DATABASE_URL:'postgresql://localhost/test',BETTER_AUTH_URL:'http://localhost:3000',BETTER_AUTH_SECRET:'guest-test-secret-that-is-at-least-32-characters',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',ENABLE_GUEST_TRIALS:'true'};
const auth=createAuth(db,env);
beforeAll(async()=>{const j=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const e of j.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,'utf8'));});
afterAll(()=>pg.close());
const request=(cookie='')=>new Request('http://localhost:3000/api/auth/sign-in/anonymous',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json',cookie},body:'{}'});
it('denies a direct anonymous endpoint call without server-validated admission',async()=>{
 const result=await auth.handler(request());expect(result.ok).toBe(false);expect(await db.select().from(schema.user)).toEqual([]);
});
it('creates a DB-backed guest session and a durable trial cookie without granting a second trial',async()=>{
 const response=await guestSignIn(request(),db,env,r=>auth.handler(r));expect(response.status).toBe(200);
 const body=await response.json();expect(body.user.isAnonymous).toBe(true);
 const cookie=response.headers.getSetCookie().find(c=>c.startsWith('perplex_trial='))!;
 expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Max-Age=2592000');
 expect(await db.select().from(schema.guestTrials)).toHaveLength(1);
 const again=await guestSignIn(request(cookie.split(';')[0]),db,env,r=>auth.handler(r));expect(again.status).toBe(403);
 expect(await db.select().from(schema.user)).toHaveLength(1);
});
it('does not trust client IP headers on an unconfigured public hosting platform',()=>{
 expect(()=>trustedGuestAddress(new Request('https://example.org',{headers:{'x-vercel-forwarded-for':'127.0.0.1'}}),{NODE_ENV:'production',BETTER_AUTH_URL:'https://example.org'})).toThrow();
});
