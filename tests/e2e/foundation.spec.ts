import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public pages are accessible and fit the viewport", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of ["/", "/sign-in"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations).toEqual([]);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: `.artifacts/sign-in-${testInfo.project.name}.png`, fullPage: true });
});

test("public workspace opens without sign-in and private history stays protected", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("textbox",{name:"Ask a question"})).toBeVisible();
  await expect(page.locator(".workspace-plan").getByRole("button",{name:"Sign up / Log in"})).toBeVisible();
  await page.goto("/library");
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator(".workspace-plan").getByRole("button", { name: "Sign up / Log in" })).toBeVisible();
  expect((await page.request.get("/api/conversations")).status()).toBe(401);
});

test("OAuth failure restores a usable sign-in button", async ({ page }) => {
  await page.route("**/api/auth/sign-in/social", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ message: "upstream unavailable" }),
  }));
  await page.goto("/sign-in");
  await page.locator(".workspace-plan").getByRole("button", { name: "Sign up / Log in" }).click();
  await expect(page.locator(".workspace-plan").getByRole("alert")).toHaveText("We couldn’t sign you in. Please try again.");
  await expect(page.locator(".workspace-plan").getByRole("button", { name: "Sign up / Log in" })).toBeEnabled();
});

test('visitor entry keeps authentication explicit and supports sidebar motion',async({page},info)=>{
 await page.goto('/');
 await expect(page).toHaveURL(/\/workspace$/);
 const login=page.locator('.workspace-plan').getByRole('button',{name:'Sign up / Log in'});
 await expect(login).toBeVisible();
 await page.getByRole('textbox',{name:'Ask a question',exact:true}).fill('A draft to keep through sign-in');
 // A signed-out visitor must stay here instead of being redirected by session renewal.
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0);
 if(info.project.name.includes('mobile')){
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Navigation',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close navigation',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Navigation',exact:true})).not.toBeVisible();
 }else{
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
  await expect(page.locator('.research-sidebar')).toHaveCSS('width','56px');
  await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
  await expect(page.locator('.research-sidebar')).toHaveCSS('width','232px');
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.locator('.research-sidebar')).toHaveCSS('transition-duration','0s');
 await page.route('**/api/auth/sign-in/social',route=>route.fulfill({status:503,json:{message:'fixture outage'}}));
 await login.click();
 await expect(page.locator('.workspace-plan').getByRole('alert')).toBeVisible();
 await expect(page).toHaveURL(/\/workspace$/);
 expect(await page.evaluate(()=>sessionStorage.getItem('perplex-workspace-draft'))).toBe('A draft to keep through sign-in');
});

test("unknown routes show an actionable 404", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page wandered off." })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
});

test('unfinished paid job and checkout boundaries stay off on the default deployment',async({request,page})=>{
 // Dynamic notFound() may stream with HTTP 200 after the layout has started.
 // Assert that access is denied in the rendered UI, not the shell's status.
 await page.goto('/reviewer-sign-in');
 await expect(page.getByRole('heading',{name:'This page wandered off.'})).toBeVisible();
 await expect(page.getByRole('textbox')).toHaveCount(0);
 await expect(page.locator('meta[name="robots"]').last()).toHaveAttribute('content',/noindex/);
 for(const path of ['/api/jobs','/api/billing'])expect((await request.get(path)).status()).toBe(404);
 expect((await request.post('/api/jobs',{data:{version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()}})).status()).toBe(404);
 expect((await request.post('/api/webhooks/razorpay',{data:{event:'subscription.charged'}})).status()).toBe(404);
});


test('workspace sign-in opens Google directly without an intermediate page',async({page})=>{
 await page.route('**/api/auth/sign-in/social',async route=>{
  const body=route.request().postDataJSON();
  expect(body.provider).toBe('google');
  expect(body.callbackURL).toBe('/workspace');
  expect(body.errorCallbackURL).toBe('/workspace?error=oauth');
  await route.fulfill({json:{url:'https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture',redirect:true}});
 });
 await page.route('https://accounts.google.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><h1>Google authorization fixture</h1></main>'}));
 await page.goto('/workspace');
 await page.locator('.workspace-plan').getByRole('button',{name:'Sign up / Log in',exact:true}).click();
 await expect(page).toHaveURL(/^https:\/\/accounts.google.com\//);
 await expect(page.getByRole('heading',{name:'Google authorization fixture'})).toBeVisible();
});

test('visitor policies stay at the bottom and OAuth errors stay in the workspace',async({page})=>{
 await page.goto('/sign-in?error=oauth');
 await expect(page).toHaveURL(/\/workspace\?error=oauth$/);
 await expect(page.getByRole('main').getByRole('alert')).toContainText('Google sign-in wasn’t completed');
 for(const height of [844,560]){
  await page.setViewportSize({width:390,height});
  const footer=page.locator('.visitor-policy-footer');
  await expect(footer.getByRole('link',{name:'Privacy',exact:true})).toBeVisible();
  const box=await footer.boundingBox(),composer=await page.locator('.question-composer').boundingBox();
  expect(box!.y+box!.height).toBeLessThanOrEqual(height);
  expect(box!.y+box!.height).toBeGreaterThanOrEqual(height-16);
  expect(composer!.y+composer!.height).toBeLessThanOrEqual(box!.y);
 }
});
