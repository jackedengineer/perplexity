import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {hashPassword} from 'better-auth/crypto';
import {beforeAll,afterAll,expect,it} from 'vitest';
import {createAuth} from '@/lib/auth-factory';
import {loadApplicationSession} from '@/lib/application-session';
import * as schema from '@/db/schema';

const pg=new PGlite(),db=drizzle(pg,{schema});
const subject='reviewer-11111111-1111-4111-8111-111111111111',email='reviewer@example.test';
const password='Fixture-review-password-123',issuedAt=new Date(Date.now()-1000).toISOString();
const expiresAt=new Date(Date.now()+6*86400000).toISOString();
const config=JSON.stringify({version:1,subject,email,issuedAt,expiresAt,origin:'http://localhost:3000'});
const env={NODE_ENV:'test' as const,DATABASE_URL:'postgresql://localhost/test',BETTER_AUTH_URL:'http://localhost:3000',BETTER_AUTH_SECRET:'reviewer-test-only-secret-over-thirty-two-characters',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-only'};
const enabled=createAuth(db,{...env,REVIEWER_LOGIN_CONFIG:config});
const disabled=createAuth(db,env);
const expired=createAuth(db,{...env,REVIEWER_LOGIN_CONFIG:JSON.stringify({version:1,subject,email,origin:env.BETTER_AUTH_URL,issuedAt:new Date(Date.now()-8*86400000).toISOString(),expiresAt:new Date(Date.now()-86400000).toISOString()})});
let sequence=0;
async function post(path:string,body:unknown,auth=enabled,cookie?:string,origin=env.BETTER_AUTH_URL){
  return auth.handler(new Request(env.BETTER_AUTH_URL+'/api/auth'+path,{method:'POST',headers:{'content-type':'application/json',origin,'x-vercel-forwarded-for':'198.51.100.'+(++sequence),...(cookie?{cookie}:{})},body:JSON.stringify(body)}));
}
async function signedIn(){const response=await post('/sign-in/email',{email,password});expect(response.status).toBe(200);return {response,cookie:response.headers.get('set-cookie')!.split(';')[0]};}
beforeAll(async()=>{
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  for(const entry of journal.entries)await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));
  for(const [id,address] of [[subject,email],['ordinary-user','ordinary@example.test']]){
    await db.insert(schema.user).values({id,name:'Synthetic reviewer test',email:address,emailVerified:true});
    await db.insert(schema.account).values({id:'credential-'+id,providerId:'credential',accountId:id,userId:id,password:await hashPassword(password)});
  }
},30000);
afterAll(()=>pg.close());

it('uses native password verification and a capped HttpOnly session for the exact reviewer',async()=>{
  const {response,cookie}=await signedIn();
  expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/);
  const data=await response.json();expect(data.user.id).toBe(subject);
  const [stored]=await db.select().from(schema.session).where(eq(schema.session.token,data.token));
  expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.parse(expiresAt));
  const session=await loadApplicationSession({getSession:headers=>enabled.api.getSession({headers}),revokeSession:async token=>{await db.delete(schema.session).where(eq(schema.session.token,token));}},new Headers({cookie}),Date.now(),config,env.BETTER_AUTH_URL);
  expect(session?.user.id).toBe(subject);
});
it('rejects wrong passwords, non-reviewer credentials, expired/disabled configuration and external origins',async()=>{
  for(const [auth,credentials,origin] of [
    [enabled,{email,password:'wrong-password'},env.BETTER_AUTH_URL],
    [enabled,{email:'ordinary@example.test',password},env.BETTER_AUTH_URL],
    [disabled,{email,password},env.BETTER_AUTH_URL],
    [expired,{email,password},env.BETTER_AUTH_URL],
    [enabled,{email,password},'https://evil.example'],
  ] as const)expect((await post('/sign-in/email',credentials,auth,undefined,origin)).status).toBeGreaterThanOrEqual(400);
});
it('does not expose public registration, password replacement or social account linking',async()=>{
  const {cookie}=await signedIn();
  for(const [path,body] of [
    ['/sign-up/email',{name:'Other',email:'other@example.test',password}],
    ['/change-password',{currentPassword:password,newPassword:'Replacement-password-123'}],
    ['/set-password',{newPassword:'Replacement-password-123'}],
    ['/update-user',{name:'Changed reviewer'}],
    ['/link-social',{provider:'google'}],
  ] as const)expect((await post(path,body,enabled,cookie)).status).toBeGreaterThanOrEqual(400);
});
it('cannot extend the reviewer deadline through rolling session renewal',async()=>{
  const {cookie}=await signedIn();
  await db.update(schema.session).set({createdAt:new Date(Date.now()-2*86400000),updatedAt:new Date(Date.now()-2*86400000),expiresAt:new Date(Date.now()+86400000)}).where(eq(schema.session.userId,subject));
  const result=await enabled.api.getSession({headers:new Headers({cookie})});expect(result?.user.id).toBe(subject);
  expect(result!.session.expiresAt.getTime()).toBeLessThanOrEqual(Date.parse(expiresAt));
});
it('revokes an existing session when reviewer configuration is disabled, even before cookie expiry',async()=>{
  const {cookie}=await signedIn();
  const result=await loadApplicationSession({getSession:headers=>enabled.api.getSession({headers}),revokeSession:async token=>{await db.delete(schema.session).where(eq(schema.session.token,token));}},new Headers({cookie}),Date.now(),undefined);
  expect(result).toBeNull();
});
it('rate-limits password attempts with the shared database counter',async()=>{
 const statuses=[];
 for(let attempt=0;attempt<6;attempt++){
  const response=await enabled.handler(new Request(env.BETTER_AUTH_URL+'/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json',origin:env.BETTER_AUTH_URL,'x-vercel-forwarded-for':'203.0.113.80'},body:JSON.stringify({email,password:'incorrect-password'})}));statuses.push(response.status);
 }
 expect(statuses.slice(0,5)).toEqual(Array(5).fill(401));expect(statuses[5]).toBe(429);
});
