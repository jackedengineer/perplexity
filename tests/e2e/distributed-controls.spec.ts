import {test,expect} from '@playwright/test';
import {eq,inArray,sql} from 'drizzle-orm';
import * as schema from '@/db/schema';
import {requestRateKey} from '@/server/runs/rate-limit';
import {getAttemptWindows} from '@/server/runs/windows';
import {identityFixture} from './identity-fixture';
import {createNeonFixture} from '../live/admission-fixture';

for(const kind of ['rate','quota'] as const)test(`${kind} denial has a usable fixed state and starts no provider work`,async({page,context},info)=>{
 const identity=await identityFixture(context,'Limits Tester'),f=createNeonFixture();
 try{
  if(kind==='rate'){
   const [{now}]=await f.owner.select({now:sql<string>`clock_timestamp()::text`.mapWith(v=>new Date(v))}).from(sql`(SELECT 1) AS clock`);
   const day=getAttemptWindows(now).find(w=>w.kind==='DAY')!;
   await f.owner.insert(schema.requestRateBuckets).values({...day,bucketKey:requestRateKey(identity.id,process.env.T11_TEST_BUDGET_KEY!),attempts:200});
  }
  await page.goto('/workspace');await page.getByRole('textbox',{name:'Ask a question'}).fill('Explain why rainbows form.');
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/chat'));await page.getByRole('button',{name:'Submit question'}).click();
  const response=await pending,body=response.request().postDataJSON();expect(response.status()).toBe(429);expect(response.headers()['x-run-id']).toBeUndefined();
  expect((await response.json()).error.code).toBe(kind==='rate'?'RATE_LIMITED':'BUDGET_EXCEEDED');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(kind==='rate'?'Too many requests.':'research allowance');
  await expect(page.getByRole('button',{name:'Stop research'})).toHaveCount(0);await expect(page.locator('.answer-prose')).toHaveCount(0);
  expect(await f.owner.select().from(schema.runs).where(eq(schema.runs.conversationId,body.conversationId))).toHaveLength(0);
  expect(await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,body.conversationId))).toHaveLength(0);
  const rows=await f.owner.select().from(schema.requestRateBuckets).where(eq(schema.requestRateBuckets.bucketKey,requestRateKey(identity.id,'')));
  expect(rows.length).toBeGreaterThan(0);
  const retry=await context.request.post('/api/chat',{headers:{Origin:'http://localhost:3001'},data:body});expect(retry.status()).toBe(429);
  await page.screenshot({path:`.artifacts/t19-${kind}-${info.project.name}.png`});
 }finally{await page.goto('/workspace');await identity.cleanup();await f.close();}
});
test('a stage deadline stays visible and same-intent retries cannot restart paid stages',async({page,context},info)=>{
 const identity=await identityFixture(context,'Deadline Tester'),f=createNeonFixture();let operatorIds:string[]=[];
 try{
  const [profile]=await f.owner.insert(schema.appUsers).values({authSubject:identity.id}).returning();
  const window={startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+86400000)};
  await f.owner.insert(schema.usageBuckets).values((['PERIOD','DAY'] as const).map(kind=>({userId:profile.id,kind,...window,entitlementVersion:'test-t19',creditLimit:10,providerLimitMicroUsd:100000n})));
  operatorIds=(await f.owner.insert(schema.operatorUsageBuckets).values((['PERIOD','DAY'] as const).map(kind=>({budgetKey:process.env.T11_TEST_BUDGET_KEY!,kind,...window,providerLimitMicroUsd:100000n}))).returning({id:schema.operatorUsageBuckets.id})).map(r=>r.id);
  await page.goto('/workspace');await page.getByRole('textbox',{name:'Ask a question'}).fill('t19-deadline Explain why rainbows form.');
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/chat'));await page.getByRole('button',{name:'Submit question'}).click();
  const response=await pending,runId=response.headers()['x-run-id'],body=response.request().postDataJSON();expect(response.status()).toBe(200);expect(runId).toBeTruthy();
  const [initial]=await f.owner.select().from(schema.runs).where(eq(schema.runs.id,runId));
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Research exceeded its time limit.',{timeout:45000});
  const status=await context.request.get(`/api/runs/${runId}`);expect((await status.json()).state).toBe('UNAVAILABLE');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Research exceeded its time limit.');
  const before=await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,runId));
  expect(before.some(c=>c.stage==='OUTPUT_SAFETY')).toBe(false);expect(before.find(c=>c.stage==='ANSWER')?.status).toBe('UNKNOWN');
  await expect(page.locator('.answer-prose')).toHaveCount(0);
  const replay=await context.request.post('/api/chat',{headers:{Origin:'http://localhost:3001'},data:body});await replay.text();
  expect(await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,runId))).toHaveLength(before.length);
  expect((await f.owner.select().from(schema.runs).where(eq(schema.runs.id,runId)))[0].deadlineAt).toEqual(initial.deadlineAt);
  expect((await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,runId)))[0].heldProviderMicroUsd).toBeGreaterThan(0n);
  await page.screenshot({path:`.artifacts/t19-deadline-${info.project.name}.png`});
 }finally{await page.goto('/workspace');await identity.cleanup();if(operatorIds.length)await f.owner.delete(schema.operatorUsageBuckets).where(inArray(schema.operatorUsageBuckets.id,operatorIds));await f.close();}
});
