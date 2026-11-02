import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public offer explains the seven-run plan without opening unready purchases',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/pricing');
  await expect(page.getByRole('heading',{level:1})).toHaveText('More room to research');
  await expect(page.getByText('7 Deep Research runs per paid month.',{exact:false})).toBeVisible();
  await expect(page.getByText('Pro is coming soon.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:/buy|subscribe|checkout/i})).toHaveCount(0);
  // A public price preview must never activate the existing TEST-only APIs.
  expect((await request.post('/api/billing/checkout',{data:{}})).status()).toBe(404);
  expect((await request.get('/api/jobs')).status()).toBe(404);
  await page.getByRole('link',{name:'cancellation and refund policy',exact:true}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Cancellation and refunds');
  await expect(page.getByRole('heading',{name:'No voluntary refunds',exact:true})).toBeVisible();
  await expect(page.getByText('This policy does not exclude remedies required by applicable law,',{exact:false})).toBeVisible();
  expect(errors).toEqual([]);
});

test('merchant information pages are public, accessible and fit narrow screens',async({page})=>{
  for(const route of ['/pricing','/refunds','/about','/terms','/privacy','/contact']){
    const response=await page.goto(route);expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
    const nav=page.getByRole('navigation',{name:'Policies and support'});
    await expect(nav.getByRole('link')).toHaveCount(6);
    if(route==='/terms'||route==='/privacy')await expect(page.getByText('Updated 2 November 2026. Paid pilot availability is checked in Billing.',{exact:true})).toBeVisible();
  }
  await page.getByRole('link',{name:'Pricing',exact:true}).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe('A');
});
