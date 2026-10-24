import {test,expect} from '@playwright/test';
import {randomInt} from 'node:crypto';
import {eq,and,inArray,sql} from 'drizzle-orm';
import AxeBuilder from '@axe-core/playwright';
import * as schema from '@/db/schema';
import {createNeonFixture} from '../live/admission-fixture';

test('guest entry, economy answer, usage, ownership and durable trial limit',async({page,context,browser},info)=>{
 const f=createNeonFixture();let subject='';const operatorIds:string[]=[];
 // The local fixture emulates Vercel's overwritten edge header. Production has no
 // client-selectable IP fallback and no test-only route or authentication bypass.
 await context.setExtraHTTPHeaders({'x-vercel-forwarded-for':`198.18.${randomInt(0,256)}.${randomInt(1,255)}`});
 try {
  const window={startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+86400000)};
  const rows=await f.owner.insert(schema.operatorUsageBuckets).values((['DAY','PERIOD'] as const).map(kind=>({kind,...window,budgetKey:process.env.T11_TEST_BUDGET_KEY!,providerLimitMicroUsd:1000000n}))).returning({id:schema.operatorUsageBuckets.id});operatorIds.push(...rows.map(r=>r.id));
  await page.goto('/sign-in');
  const signedIn=page.waitForResponse(r=>r.url().endsWith('/api/auth/sign-in/anonymous'));
  await page.getByRole('button',{name:'Try 3 answers free'}).click();
  const response=await signedIn;expect(response.status()).toBe(200);subject=(await response.json()).user.id;
  await expect(page).toHaveURL(/\/workspace$/);
  const models=page.getByRole('combobox',{name:'Answer model'});
  await expect(models).toHaveValue('economy-nano');
  await expect(models.locator('option')).toHaveCount(1);
  await expect(page.locator('.usage-summary')).toContainText('Guest trial · 6 credits left');
  await page.getByRole('textbox',{name:'Ask a question'}).fill('Why do rainbows form?');
  await page.getByRole('button',{name:'Submit question'}).click();
  await expect(page.locator('.answer-prose')).toContainText('A rainbow appears',{timeout:60000});
  await expect(page.locator('.usage-summary')).toContainText('Guest trial · 4 credits left');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.artifacts/guest-trials-${info.project.name}.png`,fullPage:true});
  const conversationId=new URL(page.url()).pathname.split('/').pop()!;
  const stranger=await browser.newContext();try{
   expect((await stranger.request.get(`http://localhost:3001/api/conversations/${conversationId}`)).status()).toBe(401);
  }finally{await stranger.close();}
  const [profile]=await f.owner.select().from(schema.appUsers).where(eq(schema.appUsers.authSubject,subject));
  const tampered=await page.request.post('/api/chat',{headers:{origin:'http://localhost:3001'},data:{conversationId,clientRequestId:crypto.randomUUID(),expectedRevision:1,mode:'FAST',modelKey:'fast-default',message:{text:'Why do rainbows form?'}}});
  expect(tampered.status()).toBe(422);expect((await tampered.json()).error.code).toBe('INVALID_INPUT');
  expect(await f.owner.select().from(schema.runs).where(eq(schema.runs.userId,profile.id))).toHaveLength(1);
  // Exhaust the fixture owner's grant without another provider request.
  await f.owner.update(schema.usageBuckets).set({settledCredits:6}).where(and(eq(schema.usageBuckets.userId,profile.id),sql`${schema.usageBuckets.retiredAt} IS NULL`));
  await f.owner.delete(schema.admissionAttemptBuckets).where(eq(schema.admissionAttemptBuckets.userId,profile.id));
  const exhausted=await page.request.post('/api/chat',{headers:{origin:'http://localhost:3001'},data:{conversationId,clientRequestId:crypto.randomUUID(),expectedRevision:1,mode:'FAST',modelKey:'economy-nano',message:{text:'Why do rainbows form?'}}});
  expect(exhausted.status()).toBe(429);expect((await exhausted.json()).error.code).toBe('BUDGET_EXCEEDED');
  await page.reload();await expect(page.locator('.usage-summary')).toContainText('0 credits left');
  expect((await page.request.post('/api/auth/sign-out',{headers:{origin:'http://localhost:3001'},data:{}})).ok()).toBe(true);
  const repeat=await page.request.post('/api/auth/sign-in/anonymous',{headers:{origin:'http://localhost:3001'},data:{}});
  expect(repeat.status()).toBe(403);
 }finally{
  await page.goto('/sign-in');
  if(subject){await f.owner.delete(schema.guestTrials).where(eq(schema.guestTrials.authSubject,subject));await f.owner.delete(schema.user).where(eq(schema.user.id,subject));}
  if(operatorIds.length)await f.owner.delete(schema.operatorUsageBuckets).where(inArray(schema.operatorUsageBuckets.id,operatorIds));
  await f.close();
 }
});
