import {readFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {eq,inArray} from 'drizzle-orm';
import * as schema from '@/db/schema';
import {identityFixture} from './identity-fixture';
import {createNeonFixture} from '../live/admission-fixture';
async function abortCount(){try{return (await readFile('.artifacts/t11-provider-calls.jsonl','utf8')).split('\n').filter(line=>line.includes('"stage":"answer-abort"')).length;}catch{return 0;}}
test('another tab cancels a paused provider and the original stream cannot publish its draft',async({page,context},info)=>{
 const identity=await identityFixture(context,'Cross-tab Tester'),f=createNeonFixture();let operatorIds:string[]=[];
 try{
  const [profile]=await f.owner.insert(schema.appUsers).values({authSubject:identity.id}).returning();
  const window={startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+86400000)};
  await f.owner.insert(schema.usageBuckets).values((['PERIOD','DAY'] as const).map(kind=>({userId:profile.id,kind,...window,entitlementVersion:'test-t18',creditLimit:10,providerLimitMicroUsd:100000n})));
  operatorIds=(await f.owner.insert(schema.operatorUsageBuckets).values((['PERIOD','DAY'] as const).map(kind=>({budgetKey:process.env.T11_TEST_BUDGET_KEY!,kind,...window,providerLimitMicroUsd:100000n}))).returning({id:schema.operatorUsageBuckets.id})).map(r=>r.id);
  const before=await abortCount();await page.goto('/workspace');await page.getByRole('textbox',{name:'Ask a question'}).fill('t18-cancel Explain why rainbows form.');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/chat'));await page.getByRole('button',{name:'Submit question'}).click();
  const runId=(await response).headers()['x-run-id'];expect(runId).toBeTruthy();
  await expect.poll(async()=>(await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,runId))).some(c=>c.stage==='ANSWER'&&c.status==='STARTED'),{timeout:25000}).toBe(true);
  const other=await context.newPage();await other.goto(page.url());await other.getByRole('button',{name:'Stop research'}).click();
  await expect(other.getByRole('main').getByRole('alert')).toContainText('Research stopped.');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Research stopped.',{timeout:15000});
  await expect.poll(abortCount).toBe(before+1);
  await expect(page.locator('.answer-prose')).toHaveCount(0);await expect(page.getByText('T18_PRIVATE_LATE_DRAFT',{exact:false})).toHaveCount(0);
  const calls=await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,runId));expect(calls.some(c=>c.stage==='OUTPUT_SAFETY')).toBe(false);
  const [receipt]=await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,runId));expect(receipt.creditsCharged).toBe(0);expect(receipt.heldProviderMicroUsd).toBeGreaterThan(0n);
  await page.screenshot({path:`.artifacts/t18-cross-tab-${info.project.name}.png`});await other.close();
 }finally{await page.goto('/workspace');await identity.cleanup();if(operatorIds.length)await f.owner.delete(schema.operatorUsageBuckets).where(inArray(schema.operatorUsageBuckets.id,operatorIds));await f.close();}
});
