import {test,expect} from '@playwright/test';
import {eq,inArray,sql} from 'drizzle-orm';
import {identityFixture} from './identity-fixture';
import {createNeonFixture} from '../live/admission-fixture';
import * as schema from '@/db/schema';

// Real HTTP, sessions and development Neon; the preload forbids paid requests.
test('ordinary self-reference completes without a classifier and survives reload',async({page,context},info)=>{
 const identity=await identityFixture(context),f=createNeonFixture();let buckets:string[]=[];
 try{
  const [profile]=await f.owner.insert(schema.appUsers).values({authSubject:identity.id}).returning();
  await f.owner.execute(sql`SELECT ensure_free_credits(${profile.id}::uuid)`);
  buckets=(await f.owner.insert(schema.operatorUsageBuckets).values((['DAY','PERIOD'] as const).map(kind=>({kind,budgetKey:process.env.T11_TEST_BUDGET_KEY!,startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+3600000),providerLimitMicroUsd:1000000n}))).returning({id:schema.operatorUsageBuckets.id})).map(x=>x.id);
  await page.goto('/workspace');await page.getByRole('button',{name:'Chat',exact:true}).click();
  await page.getByRole('textbox',{name:'Ask a question'}).fill('What is my name?');
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/chat'));
  await page.getByRole('button',{name:'Submit question'}).click();
  const response=await pending,runId=response.headers()['x-run-id'];expect(runId).toBeTruthy();
  await expect(page.locator('.answer-prose')).toContainText('You have not told me your name',{timeout:60000});
  const calls=await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,runId));
  expect(calls.map(c=>c.stage)).toEqual(['ANSWER']);
  expect((await f.owner.select().from(schema.inputSafetyReviews).where(eq(schema.inputSafetyReviews.runId,runId)))[0]).toMatchObject({reason:'LOCAL_CHECK',modelId:null});
  expect((await f.owner.select().from(schema.outputReviews).where(eq(schema.outputReviews.runId,runId)))[0]).toMatchObject({guardVersion:'local-boundary-v1'});
  expect((await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,runId)))[0]).toMatchObject({knownProviderMicroUsd:100n,heldProviderMicroUsd:0n});
  await page.reload();await expect(page.locator('.answer-prose')).toContainText('You have not told me your name');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.artifacts/identity-safety/chat-${info.project.name}.png`,fullPage:true});
 }finally{await page.goto('/workspace');await identity.cleanup();if(buckets.length)await f.owner.delete(schema.operatorUsageBuckets).where(inArray(schema.operatorUsageBuckets.id,buckets));await f.close();}
});
