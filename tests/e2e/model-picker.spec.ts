import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const models=[{key:'economy-qwen',name:'Qwen3 30B',credits:2,band:'ECONOMY'},{key:'economy-gemini',name:'Gemini 2.5 Flash Lite',credits:2,band:'ECONOMY'},{key:'standard-deepseek',name:'DeepSeek V3',credits:5,band:'STANDARD'}];
async function fixture(page:import('@playwright/test').Page,pro=false){
 await page.route('**/api/models',async route=>{const response=await route.fetch(),body=await response.json();body.models=models;body.usage.subscription=pro?{plan:'PRO',endsAt:new Date(Date.now()+86400000).toISOString(),reportsRemaining:5}:null;await route.fulfill({json:body});});
 await page.goto('/');
}
test('picker selects models, supports keyboard and stays inside the viewport',async({page},info)=>{
 await fixture(page);const trigger=page.getByRole('button',{name:'Answer model: Qwen3 30B'});await trigger.click();
 const menu=page.getByRole('menu',{name:'Answer models'});await expect(menu).toBeVisible();
 await expect(page.getByRole('menuitemradio',{name:/Qwen3/})).toBeFocused();
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Answer model: Gemini 2.5 Flash Lite'})).toBeFocused();await expect(menu).toHaveCount(0);
 await page.getByRole('button',{name:'Answer model: Gemini 2.5 Flash Lite'}).click();
 const box=await menu.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
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
