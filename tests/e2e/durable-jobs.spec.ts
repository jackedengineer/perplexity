import {createHash,createHmac} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {Pool} from 'pg';
import {identityFixture} from './identity-fixture';
import {requestRateKey} from '../../src/server/runs/rate-limit';

test('replays durable work, enforces paid ownership, and stops the real worker',async({page,context,browser},testInfo)=>{
 const identity=await identityFixture(context,'Durable Sandbox Tester');
 const direct=new URL(process.env.DATABASE_URL_DIRECT??'');if(direct.hostname!=='ep-sweet-night-az8bacv2.c-3.ap-southeast-1.aws.neon.tech')throw new Error('Dedicated development target required');
 const owner=new Pool({connectionString:direct.toString(),max:1,connectionTimeoutMillis:5000});let ownerId:string|undefined;
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const timings:number[]=[];
 page.on('requestfinished',request=>{if(request.url().includes('/api/jobs/')){const timing=request.timing();if(timing.responseEnd>=0)timings.push(timing.responseEnd);}});
 try{
  await page.goto('/jobs');await page.getByRole('button',{name:'Run execution check',exact:true}).click();
  await expect(page.getByRole('region',{name:'Durable execution'}).getByRole('alert')).toContainText('verified Pro test subscription');
  const result=await owner.query<{id:string}>('INSERT INTO app_users(auth_subject) VALUES ($1) ON CONFLICT(auth_subject) DO UPDATE SET auth_subject=excluded.auth_subject RETURNING id',[identity.id]);ownerId=result.rows[0].id;
  const ref=crypto.randomUUID().replaceAll('-','');
  await owner.query(`INSERT INTO billing_checkouts(user_id,request_id,plan_id,price_key,environment,subscription_id,state) VALUES ($1,$2,'plan_browserfixture','pro-monthly-inr-v1','TEST',$3,'READY')`,[ownerId,crypto.randomUUID(),'sub_'+ref]);
  await owner.query(`INSERT INTO job_periods(user_id,environment,payment_id,invoice_id,subscription_id,starts_at,ends_at,job_limit) VALUES ($1,'TEST',$2,$3,$4,now()-interval '1 second',now()+interval '1 hour',5)`,[ownerId,'pay_'+ref,'inv_'+ref,'sub_'+ref]);
  await page.getByRole('button',{name:'Run execution check',exact:true}).click();await expect(page).toHaveURL(/\/jobs\?job=/);
  const id=new URL(page.url()).searchParams.get('job')!;
  await page.reload();await expect(page.getByRole('heading',{name:/Waiting for a worker|Worker connected/})).toBeVisible();
  await expect(page.getByRole('list',{name:'Saved progress'})).toContainText('Checkpoint started',{timeout:60000});
  const outsiderContext=await browser.newContext({baseURL:'http://localhost:3000'}),outsider=await identityFixture(outsiderContext,'Other Durable Tester');
  try{
   expect((await outsiderContext.request.get(`/api/jobs/${id}?after=0`)).status()).toBe(404);
   expect((await outsiderContext.request.post(`/api/jobs/${id}/cancel`,{headers:{Origin:'http://localhost:3000'}})).status()).toBe(404);
  }finally{await owner.query('DELETE FROM request_rate_buckets WHERE bucket_key=$1',[requestRateKey('jobs:'+outsider.id,'jobs-http-v1')]);await outsider.cleanup();await outsiderContext.close();}
  await page.getByRole('button',{name:'Stop',exact:true}).click();await expect(page.getByRole('heading',{name:'Execution stopped',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Execution stopped',exact:true})).toBeVisible();
  await expect(page.getByRole('list',{name:'Saved progress'})).not.toContainText('Execution check complete');
  await page.getByRole('button',{name:'Run execution check',exact:true}).click();
  await expect(page).not.toHaveURL(new RegExp(id));
  await expect(page.getByRole('heading',{name:'Execution check complete',exact:true})).toBeVisible({timeout:60000});
  await page.reload();await expect(page.getByText('All three checkpoints are saved.',{exact:false})).toBeVisible();
  const completedUrl=page.url();await page.getByRole('link',{name:/Execution check CANCELLED/}).click();await expect(page.getByRole('heading',{name:'Execution stopped',exact:true})).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(completedUrl);await expect(page.getByRole('heading',{name:'Execution check complete',exact:true})).toBeVisible();
  await expect(page.getByRole('list',{name:'Saved progress'}).locator('li').filter({hasText:'Checkpoint saved'})).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`.artifacts/jobs-browser-${testInfo.project.name}.png`,fullPage:true});
  await page.goto('/billing');await expect(page.getByRole('heading',{name:'Pro subscription',exact:true})).toBeVisible();await page.reload();
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.jobs-card').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  expect(errors).toEqual([]);
  const sorted=timings.toSorted((a,b)=>a-b),metrics={samples:sorted.length,p50Ms:sorted[Math.floor(sorted.length*.5)]??0,p95Ms:sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]??0,maxMs:Math.max(0,...sorted)};
  await writeFile(`.artifacts/jobs-api-latency-${testInfo.project.name}.json`,JSON.stringify(metrics));
  await testInfo.attach('job-api-timings',{body:JSON.stringify(metrics),contentType:'application/json'});
 }finally{
  if(ownerId){
   const rows=await owner.query<{id:string}>('SELECT id FROM durable_jobs WHERE user_id=$1',[ownerId]);
   for(const {id} of rows.rows)await context.request.post(`/api/jobs/${id}/cancel`,{headers:{Origin:'http://localhost:3000'}});
   for(const table of ['job_events','job_steps','job_outbox','job_reservations'])await owner.query(`DELETE FROM ${table} WHERE job_id IN (SELECT id FROM durable_jobs WHERE user_id=$1)`,[ownerId]);
   await owner.query('DELETE FROM durable_jobs WHERE user_id=$1',[ownerId]);await owner.query('DELETE FROM job_periods WHERE user_id=$1',[ownerId]);await owner.query('DELETE FROM billing_checkouts WHERE user_id=$1',[ownerId]);
  }
  for(const prefix of ['jobs:','billing:'])await owner.query('DELETE FROM request_rate_buckets WHERE bucket_key=$1',[requestRateKey(prefix+identity.id,'jobs-http-v1')]);
  await owner.end();await identity.cleanup();
 }
});

test('authenticates raw webhook bytes, persists replay protection and never grants an uncollected mandate',async({request})=>{
 const direct=new URL(process.env.DATABASE_URL_DIRECT??'');if(direct.hostname!=='ep-sweet-night-az8bacv2.c-3.ap-southeast-1.aws.neon.tech'||!process.env.RAZORPAY_WEBHOOK_SECRET)throw new Error('Dedicated test webhook configuration required');
 const db=new Pool({connectionString:direct.toString(),max:1,connectionTimeoutMillis:5000}),suffix=crypto.randomUUID().replaceAll('-',''),eventId='evt_'+suffix,subscription='sub_'+suffix;
 const body=Buffer.from(JSON.stringify({event:'subscription.authenticated',payload:{subscription:{entity:{id:subscription}}}},null,2));
 const signature=(bytes:Buffer)=>createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET!).update(bytes).digest('hex');
 const send=(bytes:Buffer,sig:string)=>request.post('/api/webhooks/razorpay',{headers:{'Content-Type':'application/json','X-Razorpay-Event-Id':eventId,'X-Razorpay-Signature':sig},data:bytes});
 try{
  expect((await send(body,signature(body))).status()).toBe(202);expect((await send(body,signature(body))).status()).toBe(202);
  const changed=Buffer.from(body.toString().replace('subscription.authenticated','subscription.activated'));
  expect((await send(changed,signature(body))).status()).toBe(400);
  expect((await send(changed,signature(changed))).status()).toBe(409);
  await expect.poll(async()=> (await db.query('SELECT state FROM billing_inbox WHERE event_id=$1',[eventId])).rows[0]?.state,{timeout:15000}).toBe('APPLIED');
  const rows=await db.query('SELECT body_hash FROM billing_inbox WHERE event_id=$1',[eventId]);expect(rows.rows).toEqual([{body_hash:createHash('sha256').update(body).digest('hex')}]);
  expect((await db.query('SELECT id FROM job_periods WHERE subscription_id=$1',[subscription])).rows).toHaveLength(0);
 }finally{await db.query('DELETE FROM billing_inbox WHERE event_id=$1',[eventId]);await db.end();}
});
