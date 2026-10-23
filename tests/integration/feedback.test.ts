import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import * as schema from '@/db/schema';
import {seedCompletion,prepareCompletion,completionSession,fakeSafety,knownUsage} from '../helpers/completion';
import {createAnswerCompletion} from '@/server/runs/complete';
import {createFeedbackRepository} from '@/server/feedback/repository';
import {createFeedbackHttp} from '@/server/feedback/http';
const pg=new PGlite(),db=drizzle(pg,{schema}),repo=createFeedbackRepository(db);
let identity:{user:{id:string};sessionId:string},messageId:string;
beforeAll(async()=>{const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const e of journal.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,'utf8'));});
beforeEach(async()=>{
 await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);
 const p=await seedCompletion(db);identity={user:{id:p.subject},sessionId:(await completionSession(db,p.subject)).sessionId};await prepareCompletion(db,p);
 const completed=await createAnswerCompletion(db,{answer:{modelId:'test/answer',generate:async()=>({text:'Water refracts light [S1].',usage:knownUsage})},output:fakeSafety()}).complete(p.subject,identity.sessionId,p.runId,new AbortController().signal);
 if(completed.kind==='DENIED')throw Error('Fixture failed');messageId=completed.messageId;
});
afterAll(()=>pg.close());
it('upserts one owner-scoped approved-message rating idempotently and reloads selected state',async()=>{
 expect(await repo.get(identity,messageId)).toMatchObject({rating:null,reason:null,version:0});
 const input={rating:'NOT_HELPFUL',reason:'WRONG_INTERPRETATION',expectedVersion:0} as const;
 const first=await repo.put(identity,messageId,input);expect(first.version).toBe(1);
 expect(await repo.put(identity,messageId,input)).toEqual(first);
 expect(await repo.get(identity,messageId)).toEqual(first);expect(await db.select().from(schema.messageFeedback)).toHaveLength(1);
 expect(await repo.put(identity,messageId,{rating:'HELPFUL',reason:null,expectedVersion:1})).toMatchObject({rating:'HELPFUL',reason:null,version:2});
 await expect(repo.put(identity,messageId,input)).rejects.toMatchObject({code:'CONFLICT'});
});
it('rejects cross-owner, user-message, unsigned and unapproved targets without disclosing their existence',async()=>{
 const foreign=await seedCompletion(db),other={user:{id:foreign.subject},sessionId:(await completionSession(db,foreign.subject)).sessionId};
 for(const id of [messageId,(await db.select().from(schema.messages)).find(m=>m.role==='USER')!.id,crypto.randomUUID()])await expect(repo.put(other,id,{rating:'HELPFUL',reason:null,expectedVersion:0})).rejects.toMatchObject({code:'NOT_FOUND'});
 expect(await db.select().from(schema.messageFeedback)).toHaveLength(0);
});
it('serializes concurrent first writes and cannot silently overwrite another tab',async()=>{
 const results=await Promise.allSettled([repo.put(identity,messageId,{rating:'HELPFUL',reason:null,expectedVersion:0}),repo.put(identity,messageId,{rating:'NOT_HELPFUL',reason:'MISSING_EVIDENCE',expectedVersion:0})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await db.select().from(schema.messageFeedback)).toHaveLength(1);
});
it('enforces session, origin, size, strict enums and no free text at the HTTP boundary',async()=>{
 const http=createFeedbackHttp({identity:async()=>identity,repository:()=>repo,origin:()=> 'http://localhost:3000',consume:async()=>{},log:()=>{}});
 const request=(data:unknown,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/messages/'+messageId+'/feedback',{method:'PUT',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});
 expect((await http.handle(request({rating:'HELPFUL',reason:null,expectedVersion:0}),messageId)).status).toBe(200);
 for(const data of [{rating:'HELPFUL',reason:'FALSE_REFUSAL',expectedVersion:1},{rating:'NOT_HELPFUL',reason:'OTHER',expectedVersion:1},{rating:'HELPFUL',reason:null,expectedVersion:1,text:'PRIVATE free text'}])expect((await http.handle(request(data),messageId)).status).toBe(422);
 expect((await http.handle(request({},'https://foreign.org'),messageId)).status).toBe(403);
 const read=await http.handle(new Request('http://localhost:3000/api/messages/'+messageId+'/feedback'),messageId);expect(read.headers.get('cache-control')).toBe('private, no-store');
});
it('works with immutable message/review grants and locks only the revocable session',async()=>{
 await pg.exec(`CREATE ROLE feedback_runtime_test; GRANT USAGE ON SCHEMA public TO feedback_runtime_test;
 GRANT SELECT ON app_users,conversations,messages,output_safety_reviews,runs,session,message_feedback TO feedback_runtime_test;
 GRANT UPDATE(expires_at) ON session TO feedback_runtime_test;
 GRANT INSERT ON message_feedback TO feedback_runtime_test; GRANT UPDATE(rating,reason,version,updated_at) ON message_feedback TO feedback_runtime_test;
 SET ROLE feedback_runtime_test;`);
 try{
  expect(await repo.get(identity,messageId)).toMatchObject({version:0});
  expect(await repo.put(identity,messageId,{rating:'NOT_HELPFUL',reason:'FALSE_REFUSAL',expectedVersion:0})).toMatchObject({version:1});
  await expect(pg.exec(`UPDATE message_feedback SET user_id=gen_random_uuid()`)).rejects.toMatchObject({code:'42501'});
 }finally{await pg.exec('RESET ROLE; DROP OWNED BY feedback_runtime_test; DROP ROLE feedback_runtime_test;');}
});
it('rejects oversized and signed-out writes, and rechecks revocation before a stored rating can change',async()=>{
 const http=createFeedbackHttp({identity:async()=>identity,repository:()=>repo,origin:()=> 'http://localhost:3000',consume:async()=>{},log:()=>{}});
 const oversized=new Request('http://localhost:3000/api/messages/'+messageId+'/feedback',{method:'PUT',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:'x'.repeat(513)});
 expect((await http.handle(oversized,messageId)).status).toBe(413);
 const signedOut=createFeedbackHttp({identity:async()=>null,repository:()=>repo,origin:()=> 'http://localhost:3000',consume:async()=>{},log:()=>{}});
 expect((await signedOut.handle(new Request('http://localhost:3000/api/messages/'+messageId+'/feedback'),messageId)).status).toBe(401);
 await repo.put(identity,messageId,{rating:'HELPFUL',reason:null,expectedVersion:0});
 await db.delete(schema.session);
 await expect(repo.put(identity,messageId,{rating:'NOT_HELPFUL',reason:'FALSE_REFUSAL',expectedVersion:1})).rejects.toMatchObject({code:'NOT_FOUND'});
 expect((await db.select().from(schema.messageFeedback))[0]).toMatchObject({rating:'HELPFUL',version:1});
});
