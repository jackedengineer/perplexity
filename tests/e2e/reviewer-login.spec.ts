import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {eq} from 'drizzle-orm';
import {createNeonFixture} from '../live/admission-fixture';
import {provisionReviewer} from '@/server/auth/provision-reviewer';
import {user,session} from '@/db/schema';
const origin='http://localhost:3102',password='Browser-fixture-only-password-123';
const policy=JSON.parse(process.env.REVIEWER_LOGIN_CONFIG!);
let f:ReturnType<typeof createNeonFixture>;
test.beforeEach(async({context})=>{
 const suffix=crypto.randomUUID().replaceAll('-','');
 // Isolated documentation-range client; never reset a shared real-IP bucket.
 await context.setExtraHTTPHeaders({'x-vercel-forwarded-for':`2001:db8:${suffix.slice(0,4)}:${suffix.slice(4,8)}::1`});
 f=createNeonFixture();await provisionReviewer(f.runtime,process.env.REVIEWER_LOGIN_CONFIG!,origin,password);
});
test.afterEach(async()=>{try{await f.owner.delete(user).where(eq(user.id,policy.subject));}finally{await f.close();}});

test('signs in through the real database, keeps ownership boundaries and denies an expired session',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/reviewer-sign-in');
 await expect(page.getByRole('heading',{level:1})).toHaveText('A space to explore.');
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByLabel('Review account email').fill(policy.email);
 await page.getByLabel('Review account password').fill('not-the-fixture-password');
 await page.getByRole('button',{name:'Sign in for review',exact:true}).click();
 await expect(page.locator('#reviewer-error')).toContainText('We couldn’t sign you in');
 await page.getByLabel('Review account password').fill(password);
 await page.getByRole('button',{name:'Sign in for review',exact:true}).click();
 await expect(page).toHaveURL(/\/workspace$/);
 await expect(page.getByRole('textbox',{name:'Ask a question'})).toBeVisible();
 const outsider=await f.identity();
 expect((await page.request.get('/api/conversations/'+outsider.conversation.id)).status()).toBe(404);
 // Ordinary authenticated ownership reads work; no paid provider request is made.
 const created=await page.request.post('/api/conversations',{headers:{origin},data:{title:'Synthetic reviewer browser check',clientRequestId:crypto.randomUUID()}});
 expect(created.status()).toBe(201);
 await f.owner.update(session).set({expiresAt:new Date(Date.now()-1000)}).where(eq(session.userId,policy.subject));
 await page.goto('/library');await expect(page).toHaveURL(/\/sign-in$/);
 expect(errors).toEqual([]);
});
