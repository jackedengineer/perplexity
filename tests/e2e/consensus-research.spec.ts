import {CONSENSUS_MODELS} from '../../src/server/deep-research/consensus-models';
import {resolveResearchTime} from '../../src/server/deep-research/time';
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {identityFixture} from './identity-fixture';
import type {JobState} from '../../src/server/jobs/contracts';
// Deterministic presentation acceptance. Only the transport is simulated; real
// provider/DB execution and Stop are separately exercised in the in-app browser.
test('streams consensus sections with frozen timeframe, citations and persisted cancellation',async({page,context},info)=>{
 const identity=await identityFixture(context,'Deep Research Presentation Tester'),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 let state:JobState='QUEUED',id=crypto.randomUUID();
 const now=new Date().toISOString(),source={sourceId:'S1',number:1,url:'https://www.sqlite.org/whentouse.html',title:'Appropriate Uses For SQLite',domain:'sqlite.org',supportStatus:'NOT_CHECKED',retrievedAt:now,contentKind:'EXTRACTED_PAGE'};
 const report={consensus:{models:CONSENSUS_MODELS,time:resolveResearchTime('Compare databases in 2024.',new Date())},question:'Compare SQLite and PostgreSQL for offline notes.',createdAt:now,sections:['Summary','Analysis','Limitations and conflicting evidence'].map(title=>({title,markdown:'SQLite is stored locally. [S1]',answer:{kind:'ANSWER',document:[{type:'paragraph',children:[{type:'text',text:'SQLite is stored locally. '},{type:'citation',number:1}]}],sources:[source]}}))};
 const job=()=>({id,workflow:'deep-research-v2',state,createdAt:now,deadlineAt:new Date(Date.now()+600000).toISOString(),cursor:state==='COMPLETED'?3:2,heldMicroUsd:'0',spentMicroUsd:'0',});
 await page.route('**/api/jobs**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname.endsWith('/report')){await route.fulfill({contentType:'application/x-ndjson',body:[{type:'meta',question:report.question,createdAt:now,consensus:report.consensus},...report.sections.map((section,index)=>({type:'section',section,index})),{type:'done'}].map(f=>JSON.stringify(f)+'\n').join('')});return;}
  if(request.method()==='POST'&&url.pathname==='/api/jobs'){expect(request.postDataJSON().workflow).toBe('deep-research-v2');id=crypto.randomUUID();state='RUNNING';await route.fulfill({status:202,json:{id}});return;}
  if(url.pathname.endsWith('/cancel')){state='CANCELLED';await route.fulfill({json:{job:job()}});return;}
  const events=[{sequence:1,code:'RUNNING',step:null,createdAt:now},{sequence:2,code:'STEP_STARTED',step:'candidate-0',createdAt:now},...(state==='COMPLETED'?[{sequence:3,code:'COMPLETED',step:null,createdAt:now}]:[])];
  await route.fulfill({json:{job:job(),events:events.filter(e=>e.sequence>Number(url.searchParams.get('after')??0))}});
 });
 try{
  await page.goto('/jobs');await page.getByLabel('Research question',{exact:true}).fill(report.question);
  await page.getByRole('button',{name:'Start research',exact:true}).click();
  await expect(page.getByRole('button',{name:'Stop',exact:true})).toBeVisible();await expect(page).toHaveURL(/\/jobs\?job=/);await page.reload();
  await expect(page.getByRole('list',{name:'Saved progress'})).toContainText('Independent analysis 1 of 3');state='COMPLETED';
  await expect(page.getByRole('heading',{name:'Research report ready',exact:true})).toBeVisible();
  await expect(page.getByRole('article').getByRole('link',{name:'Source 1: Appropriate Uses For SQLite'})).toHaveCount(3);
  await expect(page.getByRole('article').getByRole('heading',{name:'Limitations and conflicting evidence',exact:true})).toBeVisible();
  await expect(page.getByRole('article')).toContainText('historical scope');await expect(page.getByRole('article')).toContainText('2024-01-01 to 2024-12-31');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:true}).click();expect((await download).suggestedFilename()).toBe('research-report.md');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`.artifacts/consensus-report-${info.project.name}.png`,fullPage:true});
  await page.getByLabel('Research question',{exact:true}).fill(report.question);await page.getByRole('button',{name:'Start research',exact:true}).click();
  await page.getByRole('button',{name:'Stop',exact:true}).click();await expect(page.getByRole('heading',{name:'Execution stopped',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Execution stopped',exact:true})).toBeVisible();expect(await page.getByRole('article').count()).toBe(0);
  await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.jobs-card').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');expect(errors).toEqual([]);
 }finally{await identity.cleanup();}
});
