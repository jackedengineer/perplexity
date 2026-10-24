import { sql } from "drizzle-orm";
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {eq} from 'drizzle-orm';
import * as schema from '@/db/schema';
import {identityFixture} from './identity-fixture';
import {createNeonFixture} from '../live/admission-fixture';
async function seed(f:ReturnType<typeof createNeonFixture>,subject:string) {
 const [profile]=await f.owner.insert(schema.appUsers).values({authSubject:subject}).returning();
 const [conversation]=await f.owner.insert(schema.conversations).values({userId:profile.id,creationRequestId:randomUUID(),creationFingerprint:'synthetic-t18',title:'Recovery verification'}).returning();
  await f.owner.execute(sql`SELECT ensure_free_credits(${profile.id}::uuid)`);
 await f.budgets();
 const result=await f.admission.admit(subject,{conversationId:conversation.id,clientRequestId:randomUUID(),expectedRevision:0,mode:'FAST',modelKey:'fast-default',message:{text:'PRIVATE_PENDING_QUESTION_MUST_NOT_APPEAR'}});
 if(result.kind!=='ADMITTED')throw new Error('Synthetic T18 admission failed');
 return {conversationId:conversation.id,runId:result.run.id};
}
test('reload discovers an active run and Stop durably cancels it without resubmitting',async({page,context},info)=>{
 const identity=await identityFixture(context,'Recovery Tester'),f=createNeonFixture();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const run=await seed(f,identity.id);let posts=0;page.on('request',r=>{if(r.url().endsWith('/api/chat'))posts++;});
  await page.goto(`/search/${run.conversationId}`);await expect(page.getByRole('status').filter({hasText:'Checking saved result'})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'Stop research'})).toBeVisible();
  const response=page.waitForResponse(r=>r.url().endsWith(`/api/runs/${run.runId}/cancellation`));
  await page.getByRole('button',{name:'Stop research'}).click();expect((await response).status()).toBe(200);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Research stopped.');
  expect((await f.owner.select().from(schema.runs).where(eq(schema.runs.id,run.runId)))[0]).toMatchObject({status:'CANCELLED',attemptVersion:2});
  expect((await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,run.runId)))[0]).toMatchObject({creditsCharged:0,heldProviderMicroUsd:0n});
  expect(posts).toBe(0);await expect(page.locator('.answer-prose')).toHaveCount(0);await expect(page.getByText('PRIVATE_PENDING_QUESTION_MUST_NOT_APPEAR')).toHaveCount(0);
  await page.screenshot({path:`.artifacts/t18-cancelled-${info.project.name}.png`});
  await page.reload();await expect(page.locator('.answer-prose')).toHaveCount(0);expect(errors).toEqual([]);
 }finally{await page.goto('/workspace');await identity.cleanup();await f.close();}
});
test('a killed expired run recovers from owned status with no private draft or paid replay',async({page,context},info)=>{
 const identity=await identityFixture(context,'Timeout Tester'),f=createNeonFixture();
 try{
  const run=await seed(f,identity.id);
  await f.owner.update(schema.runs).set({createdAt:new Date(Date.now()-120000),deadlineAt:new Date(Date.now()-60000)}).where(eq(schema.runs.id,run.runId));
  let posts=0;page.on('request',r=>{if(r.url().endsWith('/api/chat'))posts++;});
  await page.goto(`/search/${run.conversationId}`);await expect(page.getByRole('main').getByRole('alert')).toContainText('This research request timed out.',{timeout:20000});
  expect(posts).toBe(0);await expect(page.locator('.answer-prose')).toHaveCount(0);
  expect((await f.owner.select().from(schema.runs).where(eq(schema.runs.id,run.runId)))[0]).toMatchObject({status:'TIMED_OUT',attemptVersion:2});
  expect(await f.owner.select().from(schema.messages).where(eq(schema.messages.conversationId,run.conversationId))).toHaveLength(0);
  await page.screenshot({path:`.artifacts/t18-timeout-${info.project.name}.png`});
 }finally{await page.goto('/workspace');await identity.cleanup();await f.close();}
});
