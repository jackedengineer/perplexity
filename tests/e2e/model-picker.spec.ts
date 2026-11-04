import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const models=[{key:'economy-qwen',name:'Qwen3 30B',credits:2,band:'ECONOMY'},{key:'economy-gemini',name:'Gemini 2.5 Flash Lite',credits:2,band:'ECONOMY'},{key:'standard-deepseek',name:'DeepSeek V3',credits:5,band:'STANDARD'}];
async function fixture(page:import('@playwright/test').Page,pro=false,path='/'){
 await page.route('**/api/models',async route=>{const response=await route.fetch(),body=await response.json();body.models=models;body.usage.subscription=pro?{plan:'PRO',endsAt:new Date(Date.now()+86400000).toISOString(),reportsRemaining:5}:null;await route.fulfill({json:body});});
 await page.goto(path);
 await expect(page.getByRole('button',{name:'Answer model: Qwen3 30B'})).toBeVisible();
}
test('picker selects models, supports keyboard and stays inside the viewport',async({page},info)=>{
 await fixture(page);const trigger=page.getByRole('button',{name:'Answer model: Qwen3 30B'});await trigger.click();
 const menu=page.getByRole('dialog',{name:'Answer models'});await expect(menu).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Search models'})).toBeFocused();
 await page.getByRole('textbox',{name:'Search models'}).fill('Gemini');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Answer model: Gemini 2.5 Flash Lite'})).toBeFocused();await expect(menu).toHaveCount(0);
 await page.getByRole('button',{name:'Answer model: Gemini 2.5 Flash Lite'}).click();
 const box=await menu.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
 await menu.evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished));});
 expect((await new AxeBuilder({page}).include('.model-popover').analyze()).violations).toEqual([]);
 await page.screenshot({path:`.artifacts/model-picker-${info.project.name}.png`});
 await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
});
test('shows verified Pro and replaces upgrade links with billing management',async({page},info)=>{
 await fixture(page,true);await expect(page.getByRole('link',{name:'Pro subscription — manage billing'}).first()).toBeVisible();
 await expect(page.getByRole('link',{name:'Upgrade to Pro'})).toHaveCount(0);
 await page.screenshot({path:`.artifacts/pro-plan-${info.project.name}.png`});
});
test('free upgrade stays visible with a collapsed sidebar and reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await fixture(page);
 await expect(page.locator('.workspace-plan').getByRole('link',{name:'Upgrade to Pro'})).toBeVisible();
 await page.getByRole('button',{name:'Answer model: Qwen3 30B'}).click();
 expect(await page.locator('.model-popover').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});

test('Pro billing links dismiss their dialog even on the billing page',async({page},info)=>{
 await fixture(page,true,'/billing');
 if(info.project.name==='mobile'){
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  const navigation=page.getByRole('dialog',{name:'Navigation',exact:true});
  await navigation.getByRole('link',{name:'Pro subscription — manage billing'}).click();
  await expect(navigation).not.toBeVisible();
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await navigation.getByRole('button',{name:'Open account menu'}).click();
 }else await page.getByRole('button',{name:'Open account menu'}).first().click();
 const account=page.getByRole('dialog',{name:'Your account'});
 await expect(account).toBeVisible();
 await account.getByRole('link',{name:'Pro subscription — manage billing'}).click();
 await expect(account).not.toBeVisible();
 await expect(page).toHaveURL(/\/billing$/);
});

test('favorites persist and model search has an empty state',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Answer model: Qwen3 30B'}).click();
 await page.getByRole('button',{name:'Favorite DeepSeek V3',exact:true}).click();
 await page.keyboard.press('Escape');await page.reload();
 await page.getByRole('button',{name:'Answer model: Qwen3 30B'}).click();
 await expect(page.getByRole('button',{name:'Unfavorite DeepSeek V3',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('textbox',{name:'Search models'}).fill('absent-model');
 await expect(page.getByRole('status')).toContainText('No models match');
});

test('retry picks another model and keeps the original turn',async({page})=>{
 await fixture(page,false,'/?saved=1');
 await page.getByRole('button',{name:'Try another model',exact:true}).click();
 const revision=page.getByRole('dialog',{name:'Try another model',exact:true});
 await revision.getByRole('button',{name:'Answer model: Qwen3 30B'}).click();
 await page.getByRole('textbox',{name:'Search models'}).fill('Gemini');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await revision.getByRole('button',{name:'Send again'}).click();
 await expect(page.getByRole('button',{name:'Answer model: Gemini 2.5 Flash Lite'})).toBeVisible();
 await expect(page.getByRole('article',{name:'Approved answer'})).toHaveCount(2,{timeout:10000});
 await expect(page.getByRole('article',{name:'Your question'})).toHaveCount(2);
});

test('edit dialog preserves original question and closes with Escape',async({page})=>{
 await fixture(page,false,'/?saved=1');
 await page.getByRole('button',{name:'Edit & resend',exact:true}).click();
 const revision=page.getByRole('dialog',{name:'Edit your question'});
 await revision.getByRole('textbox',{name:'Question',exact:true}).fill('Explain evaporation simply.');
 await page.keyboard.press('Escape');await expect(revision).not.toBeVisible();
 await expect(page.getByRole('article',{name:'Your question'})).toContainText('How does the water cycle work?');
 await expect(page.getByRole('article',{name:'Your question'})).toHaveCount(1);
 await page.getByRole('button',{name:'Deep Research Pro'}).click();
 await expect(page.getByRole('link',{name:'Upgrade to Pro ↗',exact:true})).toBeVisible();
});

test('Sources never cover the answer or composer on desktop',async({page},info)=>{
 test.skip(info.project.name!=='desktop','Desktop side panel; mobile uses a modal.');
 await fixture(page,false,'/?saved=1');
 await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
  await expect(page.locator('.research-sidebar')).toHaveCSS('width','232px');
 for(const width of [1200,1280,1440]){
  await page.setViewportSize({width,height:800});
  await page.getByRole('button',{name:'Sources',exact:true}).click();
  await expect(page.locator('.thread-content')).toHaveCSS('padding-right','360px');
  await expect(page.locator('.thread-bottom')).toHaveCSS('margin-right','328px');
  const panel=await page.locator('.answer-sources').boundingBox();
  for(const selector of ['.answer-prose','.thread-bottom']){
   const box=await page.locator(selector).boundingBox();
   expect(box!.x+box!.width).toBeLessThanOrEqual(panel!.x-16);
   expect(box!.width).toBeGreaterThan(500);
  }
  await page.getByRole('button',{name:'Sources',exact:true}).click();
  await expect(page.locator('.thread-bottom')).toHaveCSS('margin-right','0px');
  await expect(page.locator('.answer-prose')).toHaveCSS('width','720px');
  const closed=await page.locator('.answer-prose').boundingBox();
  expect(closed!.width).toBe(720);
 }
});

test('library search, clear and Escape preserve the pinned scope',async({page},info)=>{
 for(const pinned of [true,false]){
  await page.goto(`/library?search=1${pinned?'&pinned=true':''}`);
  await expect(page.locator('.workspace-plan').getByRole('link',{name:'Upgrade to Pro'})).toBeVisible();
  if(info.project.name==='desktop'){
   const plan=await page.locator('.workspace-plan').boundingBox();
   const create=await page.locator('.library-page').getByRole('link',{name:'New',exact:true}).boundingBox();
   expect(create!.x+create!.width).toBeLessThanOrEqual(plan!.x);
  }
  const input=page.getByRole('searchbox',{name:'Search your conversations'});
  await input.fill('water & clouds');await input.press('Enter');
  await expect(page).toHaveURL(url=>url.searchParams.get('q')==='water & clouds'&&url.searchParams.has('pinned')===pinned);
  await expect(page.getByRole('heading',{name:pinned?'Pinned chats':'Chats',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await expect(page).toHaveURL(url=>!url.searchParams.has('q')&&url.searchParams.has('pinned')===pinned);
  await input.press('Escape');
  await expect(page).toHaveURL(url=>!url.searchParams.has('search')&&url.searchParams.has('pinned')===pinned);
  await expect(page.locator('.library-page').getByRole('button',{name:'Search conversations',exact:true})).toBeVisible();
 }
});

for(const mode of ['Chat','Web'] as const)test(`${mode} question survives navigation between route groups`,async({page})=>{
 await page.route('**/api/chat',route=>route.fulfill({status:503,json:{error:{message:'The research provider is temporarily unavailable. Please try again later.'}}}));
 await page.goto('/workspace');
 await expect(page.getByRole('button',{name:/Answer model:/})).toBeEnabled();
 await page.getByRole('button',{name:/Answer model:/}).click();
 await page.getByRole('textbox',{name:'Search models'}).fill('Qwen');
 await page.keyboard.press('ArrowDown');
 await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Answer model: Qwen3 30B',exact:true})).toBeFocused();
 await page.getByRole('button',{name:mode,exact:true}).click();
 await page.getByRole('textbox',{name:'Ask a question',exact:true}).fill('Explain why triangles have three sides.');
 const submitted=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/chat'&&request.method()==='POST');
 await page.getByRole('button',{name:'Submit question',exact:true}).click();
 const body=(await submitted).postDataJSON();
 expect(body.message.text).toBe('Explain why triangles have three sides.');
 expect(body.mode).toBe(mode==='Chat'?'CHAT':'FAST');
 expect(body.modelKey).toBe('economy-qwen');
 await expect(page).toHaveURL(/\/search\/10000000-0000-4000-8000-000000000002$/);
 await expect(page.getByRole('article',{name:'Your question'})).toContainText('Explain why triangles have three sides.');
 await expect(page.getByRole('button',{name:mode,exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Answer model: Qwen3 30B',exact:true})).toBeVisible();
});

test('larger verified models are searchable, priced and selectable',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:/Answer model:/}).click();
 await page.getByRole('textbox',{name:'Search models'}).fill('3.7');
 await page.getByRole('button',{name:'Gemini 3.7 Flash Fast general answers · Google 8 credits per answer',exact:true}).click();
 await expect(page.getByRole('button',{name:'Answer model: Gemini 3.7 Flash'})).toBeVisible();
 await page.getByRole('button',{name:'Answer model: Gemini 3.7 Flash'}).click();
 await page.getByRole('textbox',{name:'Search models'}).fill('397');
 await page.getByRole('button',{name:'Qwen3.5 397B Large open model · 397B 8 credits per answer',exact:true}).click();
 await expect(page.getByRole('button',{name:'Answer model: Qwen3.5 397B'})).toBeVisible();
});
test('pricing has a direct billing CTA and a Google upgrade action for visitors',async({page})=>{
 await page.goto('/upgrade-preview');
 await expect(page.getByRole('link',{name:'Upgrade to Pro · ₹999'})).toHaveAttribute('href','/billing');
 await expect(page.getByRole('button',{name:'Start one month for ₹999'})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Refresh billing status'})).toBeVisible();
 await expect(page.locator('main')).not.toContainText('pilot');
 await page.goto('/upgrade-preview?signedOut=1');
 await expect(page.getByRole('button',{name:'Sign in to upgrade · ₹999'})).toBeVisible();
});

test('visitor upgrade sends Google the billing return destination',async({page})=>{
 let destination:string|undefined;
 await page.route('**/api/auth/sign-in/social',async route=>{
  const body=route.request().postDataJSON();expect(body.provider).toBe('google');destination=body.callbackURL;
  await route.fulfill({status:503,json:{message:'Offline authorization fixture'}});
 });
 await page.goto('/upgrade-preview?signedOut=1');
 await page.getByRole('button',{name:'Sign in to upgrade · ₹999'}).click();
 await expect(page.getByRole('alert').filter({hasText:'We couldn’t sign you in'})).toBeVisible();
 expect(destination).toBe('/billing');
});
