import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {identityFixture} from './identity-fixture';
test('replays focused questions and resumes the original research with idempotent answers',async({page,context},info)=>{
 const identity=await identityFixture(context,'Research Clarification Tester'),parent=crypto.randomUUID(),child=crypto.randomUUID(),now=new Date().toISOString();let attempts=0,requestId='';
 const original='Which database is better for my project?';
 await page.route('**/api/jobs**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='POST'){
   const body=request.postDataJSON();expect(body.question).toBe(original);expect(body.continuation).toEqual({jobId:parent,answers:[{id:'Q1',answer:'SQLite and PostgreSQL\nAn offline notes application'}]});
   if(attempts++===0){requestId=body.requestId;await route.fulfill({status:503,json:{error:{message:'Please retry your saved answers.'}}});return;}
   expect(body.requestId).toBe(requestId);await route.fulfill({status:202,json:{id:child}});return;
  }
  const waiting=url.pathname.endsWith(parent);
  await route.fulfill({json:{job:{id:waiting?parent:child,question:original,locale:'en',workflow:'deep-research-v2',state:waiting?'NEEDS_INPUT':'RUNNING',createdAt:now,deadlineAt:now,cursor:0,heldMicroUsd:'0',spentMicroUsd:'100',...(waiting?{clarification:{canContinue:true,questions:[{id:'Q1',question:'Which databases and application are you comparing?',options:['SQLite and PostgreSQL for offline notes','MySQL and PostgreSQL for a web application']}]}}:{})},events:[]}});
 });
 try{
  await page.goto(`/jobs?job=${parent}`);await expect(page.getByRole('heading',{name:'A quick clarification'})).toBeVisible();await page.reload();
  await expect(page.getByRole('button',{name:'Continue research',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'SQLite and PostgreSQL for offline notes',exact:true}).click();
  await expect(page.getByLabel('Which databases and application are you comparing?',{exact:true})).toHaveValue('SQLite and PostgreSQL for offline notes');
  await page.getByLabel('Which databases and application are you comparing?',{exact:true}).fill('SQLite and PostgreSQL\nAn offline notes application');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`.artifacts/research-clarification-${info.project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Continue research',exact:true}).click();await expect(page.getByText('Please retry your saved answers.')).toBeVisible();
  await page.getByRole('button',{name:'Continue research',exact:true}).click();await expect(page).toHaveURL(new RegExp(child));await expect(page.getByRole('button',{name:'Stop',exact:true})).toBeVisible();
  expect(attempts).toBe(2);
 }finally{await identity.cleanup();}
});
