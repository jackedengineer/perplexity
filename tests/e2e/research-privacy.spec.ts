import {test,expect} from '@playwright/test';
import {eq} from 'drizzle-orm';
import * as schema from '@/db/schema';
import {admitJob} from '@/server/jobs/admission';
import {claimJob,startStep,completeStep} from '@/server/jobs/worker';
import {consumeResearch} from '@/server/deep-research/consumer';
import {requestRateKey} from '@/server/runs/rate-limit';
import {createNeonFixture} from '../live/admission-fixture';
import {models,providers} from '../integration/deep-fixture';
import {identityFixture} from './identity-fixture';

test('exports owned approved research, deletes content and fences a running worker in development Neon',async({page,context,browser},info)=>{
 test.setTimeout(90000);
 const identity=await identityFixture(context,'Research Privacy Tester'),f=createNeonFixture(),ids:string[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));let ownerId:string|undefined;
 try{
  const [owner]=await f.owner.insert(schema.appUsers).values({authSubject:identity.id}).returning();ownerId=owner.id;
  await f.budgets(1_000_000n);const suffix=crypto.randomUUID().replaceAll('-','');
  await f.owner.insert(schema.billingCheckouts).values({userId:owner.id,requestId:crypto.randomUUID(),planId:'plan_privacy',priceKey:'pro-monthly-inr-v1',environment:'TEST',subscriptionId:'sub_'+suffix,state:'READY'});
  await f.owner.insert(schema.jobPeriods).values({userId:owner.id,environment:'TEST',paymentId:'pay_'+suffix,invoiceId:'inv_'+suffix,subscriptionId:'sub_'+suffix,startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+3600000),jobLimit:10});
  const submit=async()=>{const id=await admitJob(f.runtime,identity.id,{version:1,workflow:'deep-research-v1',requestId:crypto.randomUUID(),question:'Compare SQLite and PostgreSQL for offline applications.',locale:'en'},f.namespace,models);ids.push(id);return id;};
  const id=await submit();expect(await consumeResearch(f.runtime,id,{budgetKey:f.namespace,providers:providers()})).toBe('COMPLETED');
  await page.goto('/jobs?job='+id);await expect(page.getByRole('heading',{name:'Research report ready',exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:true}).click();expect((await download).suggestedFilename()).toBe('research-report.md');
  const outsiderContext=await browser.newContext({baseURL:'http://localhost:3000'}),outsider=await identityFixture(outsiderContext,'Other Research Privacy Tester');
  try{
   expect((await outsiderContext.request.get(`/api/jobs/${id}`)).status()).toBe(404);
   expect((await outsiderContext.request.post(`/api/jobs/${id}/delete`,{headers:{Origin:'http://localhost:3000'}})).status()).toBe(404);
  }finally{await f.ownerPool.query('DELETE FROM request_rate_buckets WHERE bucket_key=$1',[requestRateKey('jobs:'+outsider.id,'jobs-http-v1')]);await outsider.cleanup();await outsiderContext.close();}
  await page.getByRole('button',{name:'Delete research',exact:true}).click();
  await expect(page.getByRole('group',{name:'Confirm research deletion'})).toBeVisible();
  await page.getByRole('button',{name:'Keep research',exact:true}).click();await expect(page.getByRole('button',{name:'Delete research',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Delete research',exact:true}).click();await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
  await expect(page).toHaveURL(/\/jobs$/);expect((await context.request.get(`/api/jobs/${id}`)).status()).toBe(404);
  const [period]=await f.runtime.select().from(schema.jobPeriods).where(eq(schema.jobPeriods.userId,owner.id));expect(period.spentJobs).toBe(1);
  const active=await submit(),lease=(await claimJob(f.runtime,active,f.namespace))!;await startStep(f.runtime,lease,'input');
  await page.goto('/jobs?job='+active);await expect(page.getByRole('button',{name:'Stop',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Delete research',exact:true}).click();await page.getByRole('button',{name:'Delete permanently',exact:true}).click();await expect(page).toHaveURL(/\/jobs$/);
  await expect(completeStep(f.runtime,lease,'input',100n,{allowed:true})).rejects.toMatchObject({code:'STALE'});
  const [reservation]=await f.runtime.select().from(schema.jobReservations).where(eq(schema.jobReservations.jobId,active));expect(reservation.heldMicroUsd).toBe(2250n);
  expect((await f.runtime.select().from(schema.jobResearchInputs).where(eq(schema.jobResearchInputs.jobId,active)))).toHaveLength(0);
  await page.reload();await expect(page.getByText('Compare SQLite and PostgreSQL for offline applications.',{exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);await page.screenshot({path:`.artifacts/paid-privacy-${info.project.name}.png`,fullPage:true});
 }finally{
  // Only captured synthetic jobs. No provider was contacted by these fixtures.
  for(const id of ids){for(const table of ['job_checkpoints','job_research_inputs','job_events','job_steps','job_outbox','job_reservations'])await f.ownerPool.query(`DELETE FROM ${table} WHERE job_id=$1`,[id]);await f.ownerPool.query('DELETE FROM durable_jobs WHERE id=$1',[id]);}
  if(ownerId){await f.ownerPool.query('DELETE FROM job_periods WHERE user_id=$1',[ownerId]);await f.ownerPool.query('DELETE FROM billing_checkouts WHERE user_id=$1',[ownerId]);}
  await f.ownerPool.query('DELETE FROM request_rate_buckets WHERE bucket_key=$1',[requestRateKey('jobs:'+identity.id,'jobs-http-v1')]);
  await f.close();await identity.cleanup();
 }
});
