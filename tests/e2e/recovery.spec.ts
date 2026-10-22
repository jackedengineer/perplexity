import {test,expect} from "@playwright/test";
import {identityFixture} from "./identity-fixture";

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
