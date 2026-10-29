import {test,expect} from "@playwright/test";
import {identityFixture} from "./identity-fixture";

// Transport-only tests intercept chat; budget/admission behavior has separate coverage.
test.beforeEach(async({page})=>{
 const window={limit:40,used:0,reserved:0,remaining:40,resetsAt:new Date(Date.now()+86400000).toISOString()};
 await page.route('**/api/models',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({models:[{key:'fast-default',name:'Test model',credits:5,band:'STANDARD'}],usage:{tier:'FREE',period:window,day:window,paymentsEnabled:false}})}));
});

test('Stop before admission headers waits for a durable cancellation and never replays chat',async({page,context},info)=>{
 const identity=await identityFixture(context),runId=crypto.randomUUID();let conversationId='',posts=0,cancellations=0;
 let release!:()=>void,received!:()=>void;
 const headers=new Promise<void>(resolve=>{release=resolve;}),seen=new Promise<void>(resolve=>{received=resolve;});
 const status=()=>({runId,conversationId,revision:1,state:'UNAVAILABLE',terminalReason:'CANCELLED'});
 try{
  await page.route('**/api/chat',async route=>{
   posts++;conversationId=route.request().postDataJSON().conversationId;received();await headers;
   await route.fulfill({status:409,headers:{'x-run-id':runId},contentType:'application/json',body:JSON.stringify({error:{code:'RUN_IN_PROGRESS',message:'This request is already running. Check its current status.'}})});
  });
  await page.route(`**/api/runs/${runId}/cancellation`,route=>{cancellations++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(status())});});
  await page.route(`**/api/runs/${runId}`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(status())}));
  await page.goto('/workspace');await page.getByRole('textbox',{name:'Ask a question'}).fill('Cancel before headers');await page.getByRole('button',{name:'Submit question'}).click();await seen;
  await page.getByRole('button',{name:'Stop research'}).click();
  await expect(page.getByRole('textbox',{name:'Ask a question'})).toHaveAttribute('placeholder','Stopping research');expect(cancellations).toBe(0);
  release();await expect(page.getByRole('main').getByRole('alert')).toContainText('Research stopped.');
  expect(posts).toBe(1);expect(cancellations).toBe(1);await expect(page.locator('.answer-prose')).toHaveCount(0);
  await page.getByRole('button',{name:'Check same request'}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Research stopped.');expect(posts).toBe(1);
  await page.screenshot({path:`.artifacts/p0-early-cancel-${info.project.name}.png`});
 }finally{release();await page.goto('/workspace');await identity.cleanup();}
});

test("status recovery offers durable cancellation for an owned server run",async({page,context})=>{
  const identity=await identityFixture(context),runId=crypto.randomUUID();let conversationId="";
  try{
    await page.route("**/api/chat",async route=>{
      conversationId=route.request().postDataJSON().conversationId;
      await route.fulfill({status:409,headers:{"x-run-id":runId},contentType:"application/json",body:JSON.stringify({error:{code:"RUN_IN_PROGRESS",message:"This request is already running. Check its current status."}})});
    });
    await page.route(`**/api/runs/${runId}`,route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({runId,conversationId,revision:1,state:"SEARCHING"})}));
    await page.route(`**/api/runs/${runId}/cancellation`,route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({runId,conversationId,revision:1,state:"UNAVAILABLE",terminalReason:"CANCELLED"})}));
    await page.goto("/workspace");await page.getByRole("textbox",{name:"Ask a question"}).fill("Recover an existing search");
    const polling=page.waitForRequest(request=>request.url().endsWith(`/api/runs/${runId}`));
    await page.getByRole("button",{name:"Submit question"}).click();await polling;
    await expect(page.getByRole("button",{name:"Stop research"})).toBeVisible();
    await expect(page.getByRole("status").filter({hasText:"Checking saved result"})).toBeVisible();
    await page.getByRole("button",{name:"Stop research"}).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Research stopped.");
  }finally{await page.goto("/workspace");await identity.cleanup();}
});
test('terminal failure replaces an earlier already-running warning',async({page,context})=>{
  const identity=await identityFixture(context),runId=crypto.randomUUID();let conversationId='',posts=0,reads=0;
  try{
    await page.route('**/api/chat',async route=>{
      posts++;conversationId=route.request().postDataJSON().conversationId;
      await route.fulfill({status:409,headers:{'x-run-id':runId},contentType:'application/json',body:JSON.stringify({requestId:crypto.randomUUID(),error:{code:'RUN_IN_PROGRESS',message:'This request is already running. Check its current status.'}})});
    });
    await page.route(`**/api/runs/${runId}`,route=>{reads++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({runId,conversationId,revision:1,state:'UNAVAILABLE'})});});
    await page.goto('/workspace');await page.getByRole('textbox',{name:'Ask a question'}).fill('Recover a completed failure');await page.getByRole('button',{name:'Submit question'}).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Research is temporarily unavailable.');
    await expect(page.getByRole('main').getByRole('alert')).not.toContainText('already running');
    await page.getByRole('button',{name:'Check same request'}).click();await expect.poll(()=>reads).toBe(2);expect(posts).toBe(1);
    await expect(page.locator('.answer-prose')).toHaveCount(0);
  }finally{await page.goto('/workspace');await identity.cleanup();}
});
