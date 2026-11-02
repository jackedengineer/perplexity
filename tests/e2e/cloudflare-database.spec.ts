import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {identityFixture} from './identity-fixture';

test('keeps native sessions available across repeated Workers invocations',async({context})=>{
 const identity=await identityFixture(context,'Cloudflare repeated session');
 try{
  // A module-global Node pool/auth can pass once, then reuse another request's I/O.
  for(let i=0;i<6;i++){
   const response=await context.request.get('/api/auth/get-session');
   expect(response.status()).toBe(200);
   expect((await response.json()).user?.id).toBe(identity.id);
  }
 }finally{await identity.cleanup();}
});

test('preserves concurrency, ownership and persistence across Workers invocations',async({context,browser,page,baseURL},info)=>{
 const identity=await identityFixture(context,'Cloudflare proof owner');
 const otherContext=await browser.newContext({baseURL});
 const other=await identityFixture(otherContext,'Cloudflare proof outsider');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/workspace');
  await expect(page.getByRole('textbox',{name:'Ask a question'})).toBeVisible();
  const intent={clientRequestId:crypto.randomUUID(),title:'Cloudflare concurrent creation'};
  const requests=await Promise.all(Array.from({length:4},()=>context.request.post('/api/conversations',{headers:{Origin:baseURL!},data:intent})));
  expect(requests.map(r=>r.status()).sort()).toEqual([200,200,200,201]);
  const ids=await Promise.all(requests.map(async r=>(await r.json()).conversation.id));
  expect(new Set(ids).size).toBe(1);const id=ids[0];
  for(let i=0;i<3;i++){
   await page.goto('/search/'+id);
   await expect(page.getByRole('heading',{name:intent.title,exact:true})).toBeVisible();
   expect((await otherContext.request.get('/api/conversations/'+id)).status()).toBe(404);
  }
  const changed=await context.request.patch('/api/conversations/'+id,{headers:{Origin:baseURL!},data:{title:'Cloudflare saved title',expectedRevision:0}});
  expect(changed.status()).toBe(200);
  await page.reload();await expect(page.getByRole('heading',{name:'Cloudflare saved title',exact:true})).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({path:'.artifacts/'+info.project.name+'.png',fullPage:true});
 }finally{await otherContext.close();await other.cleanup();await identity.cleanup();}
});
