import {createHmac} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {requestRateKey} from '@/server/runs/rate-limit';
import {expect,test,type BrowserContext} from '@playwright/test';
import * as schema from '@/db/schema';
import {createRunAdmission} from '@/server/runs/admit';
import {parseAdmissionEnvironment} from '@/server/runs/env';
import {createAnswerCompletion} from '@/server/runs/complete';
import {createNeonFixture} from '../live/admission-fixture';
import {completionSession,prepareCompletion,fakeSafety,knownUsage} from '../helpers/completion';

// Real workerd endpoints and development Postgres; only the provider results are
// synthetic. No test route, provider key, real charge or budget bypass is installed.
async function person(f:ReturnType<typeof createNeonFixture>,context:BrowserContext){
 const p=await f.identity();p.request.message.text='Why do rainbows form?';
 const keys=parseAdmissionEnvironment(process.env);
 const result=await createRunAdmission(f.runtime,keys,f.policy).admit(p.subject,p.request);
 if(result.kind!=='ADMITTED')throw new Error('Isolated fixture admission failed');
 const who={...p,runId:result.run.id,...await completionSession(f.owner,p.subject)};
 await prepareCompletion(f.runtime,who,keys);
 const secret=process.env.BETTER_AUTH_SECRET!;
 await context.addCookies([{name:'perplex.session_token',value:encodeURIComponent(who.token+'.'+createHmac('sha256',secret).update(who.token).digest('base64')),domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
 return who;
}
test('renders committed citations and replays an approved answer over Workers SSE',async({page,context,baseURL},info)=>{
 const f=createNeonFixture();let subject:string|undefined;
 try{
  await f.budgets();const who=await person(f,context);subject=who.subject;
  const result=await createAnswerCompletion(f.runtime,{
   answer:{modelId:'test/answer',generate:async()=>({text:'Water refracts sunlight [S1].',usage:knownUsage})},output:fakeSafety(),
  }).complete(who.subject,who.sessionId,who.runId,new AbortController().signal);
  expect(result.kind).toBe('COMMITTED');
  const before=await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,who.runId));
  await page.goto('/search/'+who.conversation.id);
  await expect(page.locator('.answer-prose')).toContainText('Water refracts sunlight');
  await expect(page.getByRole('link',{name:'Source 1: Rainbow evidence',exact:true})).toHaveAttribute('href','https://example.org/rainbows');
  await page.getByRole('button',{name:'1 source',exact:true}).click();
  await expect(page.getByRole(info.project.use.isMobile?'dialog':'complementary',{name:'Answer sources'})).toBeVisible();
  // The normal authenticated replay path must work without configuring a model.
  const replay=await context.request.post('/api/chat',{headers:{Origin:baseURL!},data:who.request});
  expect(replay.status()).toBe(200);
  expect(replay.headers()['content-type']).toContain('text/event-stream');
  expect(replay.headers()['cache-control']).toBe('private, no-store');
  const wire=await replay.text();
  for(const type of ['data-run','data-answer','source-url','text-delta','finish'])expect(wire).toContain('"type":"'+type+'"');
  expect(wire).not.toMatch(/PRIVATE REASONING|UNREVIEWED_PRIVATE_DRAFT|contentHash|passageId/);
  const after=await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,who.runId));
  expect(after.map(c=>c.id).sort()).toEqual(before.map(c=>c.id).sort());
  await page.reload();await expect(page.locator('.answer-prose')).toContainText('Water refracts sunlight');
  await page.screenshot({path:'.artifacts/cloudflare-approved-'+info.project.name+'.png',fullPage:true});
 }finally{try{if(subject)await f.owner.delete(schema.requestRateBuckets).where(eq(schema.requestRateBuckets.bucketKey,requestRateKey(subject,'cloudflare-proof')));}finally{await f.close();}}
});

test('recovers saved progress and durably cancels from the browser',async({page,context})=>{
 const f=createNeonFixture();let subject:string|undefined;
 try{
  await f.budgets();const who=await person(f,context);subject=who.subject;
  const status=await context.request.get('/api/runs/'+who.runId);
  expect(status.status()).toBe(200);expect((await status.json()).state).toBe('PREPARING_ANSWER');
  await page.goto('/search/'+who.conversation.id);
  await expect(page.getByRole('status').filter({hasText:'Checking saved result'})).toBeVisible();
  const response=page.waitForResponse(r=>r.url().endsWith('/cancellation')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Stop research',exact:true}).click();
  const cancelled=await response;expect(cancelled.status()).toBe(200);
  expect((await cancelled.json()).terminalReason).toBe('CANCELLED');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Research stopped.');
  const [run]=await f.owner.select().from(schema.runs).where(eq(schema.runs.id,who.runId));
  expect(run.status).toBe('CANCELLED');
  expect(await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,who.runId))).toHaveLength(1);
  const saved=await context.request.get('/api/runs/'+who.runId);
  expect((await saved.json()).terminalReason).toBe('CANCELLED');
 }finally{try{if(subject)await f.owner.delete(schema.requestRateBuckets).where(eq(schema.requestRateBuckets.bucketKey,requestRateKey(subject,'cloudflare-proof')));}finally{await f.close();}}
});
