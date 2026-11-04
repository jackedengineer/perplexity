import {expect,test} from '@playwright/test';

test('sidebar exits retain their geometry and can reverse without losing controls',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('/?saved=1&motion=slow');
 if(info.project.name==='mobile'){
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  const drawer=page.locator('.mobile-navigation');
  await expect(drawer).toHaveCSS('opacity','1');
  await drawer.getByRole('button',{name:'Close navigation',exact:true}).click();
  await expect(drawer).not.toHaveAttribute('open','');
  await expect.poll(()=>drawer.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeLessThan(1);
  expect(await drawer.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeGreaterThan(0);
  expect(await drawer.evaluate(el=>getComputedStyle(el).width)).toBe('280px');
  await expect(drawer).toHaveCSS('display','none');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await expect(drawer.getByRole('link',{name:'New conversation'})).toBeVisible();
  await drawer.getByRole('button',{name:'Close navigation',exact:true}).press('Escape');
  await expect(drawer).toHaveCSS('display','none');
 }else{
  const sidebar=page.locator('.research-sidebar');
  await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
  await expect(sidebar).toHaveCSS('width','232px');
  const copy=sidebar.locator('.account-name');
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
  await expect(copy).toHaveCount(1); // Stays mounted for the exit.
  await expect.poll(()=>sidebar.evaluate(el=>el.getBoundingClientRect().width)).toBeLessThan(232);
  expect(await sidebar.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(56);
  await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
  await expect(sidebar).toHaveCSS('width','232px');
  await expect(page.getByRole('button',{name:'Collapse sidebar',exact:true})).toBeFocused();
 }
});

test('Sources animate in and out, and reduced motion removes movement',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('/?saved=1&motion=slow');
 const source=page.locator(info.project.name==='mobile'?'.mobile-sources-dialog':'.answer-sources');
 await page.getByRole('button',{name:'Sources',exact:true}).click();
 await expect.poll(()=>source.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeGreaterThan(0);
 expect(await source.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeLessThan(1);
 await expect(source).toHaveCSS('opacity','1');
 if(info.project.name==='mobile')await source.getByRole('button',{name:'Close sources'}).click();
 else await page.getByRole('button',{name:'Sources',exact:true}).click();
 await expect.poll(()=>source.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeLessThan(1);
 expect(await source.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeGreaterThan(0);
 if(info.project.name==='desktop')await expect(source).toHaveAttribute('inert','');
 await expect(source).toHaveCSS('opacity','0');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'Sources',exact:true}).click();
 await expect(source).toHaveCSS('transition-duration','0s');
 await expect(source).toHaveCSS('opacity','1');
 expect(await page.locator('.research-sidebar').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
});
