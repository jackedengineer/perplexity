import {expect,test,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function submit(page:Page){
 await page.getByRole('textbox',{name:'Ask a question'}).fill('How does the water cycle work?');
 await page.getByRole('button',{name:'Submit question',exact:true}).click();
}
test('typing, submission and preparation have restrained visual feedback',async({page},info)=>{
 await page.goto('/');
 const form=page.locator('.question-composer');
 await expect(form).toHaveAttribute('data-has-text','false');
 await page.getByRole('textbox',{name:'Ask a question'}).pressSequentially('Water cycle',{delay:25});
 await expect(form).toHaveAttribute('data-has-text','true');
 await expect(page.getByRole('button',{name:'Submit question',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Submit question',exact:true}).click();
 await expect(form).toHaveAttribute('aria-busy','true');
 await expect(page.getByRole('button',{name:'Stop research'})).toBeVisible();
 await expect(page.locator('.progress-label')).toHaveText('Searching the web');
 await expect(page.locator('.answer-prose')).toHaveCount(0);
 await page.screenshot({path:`.artifacts/motion-preparing-${info.project.name}.png`});
 await page.getByRole('button',{name:'Stop research'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Research stopped'})).toBeVisible();
});
test('approved words grow monotonically through saved-prop refresh, preserving citations and formatting',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await submit(page);
 const prose=page.locator('.answer-prose');
 await expect(prose).toHaveAttribute('aria-busy','true');
 const samples:string[]=[];
 for(let i=0;i<5;i++){
  samples.push(await prose.textContent()??'');
  // Fixed observation intervals inspect intermediate words, not readiness.
  await page.waitForTimeout(100);
 }
 expect(samples.at(-1)!.length).toBeGreaterThan(samples[0].length);
 for(let i=1;i<samples.length;i++)expect(samples[i].startsWith(samples[i-1])).toBe(true);
 await page.screenshot({path:`.artifacts/motion-revealing-${info.project.name}.png`});
 await expect(prose).toHaveAttribute('aria-busy','false',{timeout:5000});
 await expect(prose).toContainText('water returns to Earth');
 await expect(prose.getByRole('link')).toHaveCount(2);
 await expect(prose.locator('strong')).toHaveCount(4);
 await expect(prose.getByRole('heading',{name:'The main stages'})).toBeVisible();
 await expect(prose.getByRole('listitem')).toHaveCount(3);
 const full=await prose.textContent();
 await page.getByRole('textbox',{name:'Ask a question'}).fill('Where does the water go next?');
 await page.getByRole('button',{name:'Submit question',exact:true}).click();
 await expect(prose.first()).toHaveText(full??'');
 await expect(prose.first()).toHaveAttribute('aria-busy','false');
 await expect(prose).toHaveCount(2,{timeout:10000});
 await expect(prose.last()).toHaveAttribute('aria-busy','true');
 await expect(prose.first()).toHaveText(full??'');
 await page.getByRole('button',{name:'Show full answer',exact:true}).click();
 await expect(prose.last()).toHaveAttribute('aria-busy','false');
 expect(errors).toEqual([]);
});
test('show full answer skips the reveal and keeps keyboard focus on the answer',async({page})=>{
 await page.goto('/');await submit(page);
 const prose=page.locator('.answer-prose');await expect(prose).toHaveAttribute('aria-busy','true');
 await page.getByRole('button',{name:'Show full answer',exact:true}).click();
 await expect(prose).toHaveAttribute('aria-busy','false');
 await expect(prose).toContainText('water returns to Earth');
 await expect(page.getByRole('article',{name:'Approved answer'})).toBeFocused();
 await expect(page.getByRole('button',{name:'Show full answer',exact:true})).toHaveCount(0);
});
test('saved history and reload show the whole answer immediately',async({page})=>{
 await page.goto('/?saved=1');
 const prose=page.locator('.answer-prose');await expect(prose).toHaveAttribute('aria-busy','false');
 await expect(prose).toContainText('water returns to Earth');
 const full=await prose.textContent();await page.reload();await expect(prose).toHaveText(full??'');
 await expect(page.getByRole('button',{name:'Show full answer',exact:true})).toHaveCount(0);
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});
test('reduced motion disables preparation animations and bypasses word reveal',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await submit(page);
 await expect(page.locator('.pending-question')).toHaveCSS('animation-name','none');
 await expect(page.locator('.question-composer')).toHaveCSS('transition-duration','0s');
 await expect(page.locator('.progress-label')).toHaveCSS('animation-name','none');
 const prose=page.locator('.answer-prose');await expect(prose).toContainText('water returns to Earth',{timeout:10000});
 await expect(prose).toHaveAttribute('aria-busy','false');
 await expect(page.getByRole('button',{name:'Show full answer',exact:true})).toHaveCount(0);
});
test('changing motion preference during reveal shows the whole answer without replay',async({page})=>{
 await page.goto('/');await submit(page);
 const prose=page.locator('.answer-prose');await expect(prose).toHaveAttribute('aria-busy','true');
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(prose).toHaveAttribute('aria-busy','false');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await expect(prose).toHaveAttribute('aria-busy','false');
 await expect(prose).toContainText('water returns to Earth');
});
