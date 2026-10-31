import { sql } from "drizzle-orm";
import { writeFile } from "node:fs/promises";
import { observeChatWire } from "./wire-observer";
import { test,expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { identityFixture } from "./identity-fixture";
import { createNeonFixture } from "../live/admission-fixture";
import * as schema from "@/db/schema";
import { eq,inArray } from "drizzle-orm";
async function provision(f: ReturnType<typeof createNeonFixture>,subject: string) {
  const [profile]=await f.owner.insert(schema.appUsers).values({authSubject:subject}).returning();
  const window={startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+86400000)};
  await f.owner.execute(sql`SELECT ensure_free_credits(${profile.id}::uuid)`);
  // Only this dedicated test namespace; refuse to overwrite any existing buckets.
  const operators=await f.owner.insert(schema.operatorUsageBuckets).values((["DAY","PERIOD"] as const).map(kind=>({budgetKey:process.env.T11_TEST_BUDGET_KEY!,kind,...window,providerLimitMicroUsd:1000000n}))).returning({id:schema.operatorUsageBuckets.id});
  return operators.map(row=>row.id);
}
test("a public question shows guarded progress, committed citations and exact reload",async({page,context,browser},info)=>{
  const identity=await identityFixture(context),f=createNeonFixture();let buckets:string[]=[];
  await observeChatWire(page);
  const errors:string[]=[],requests:unknown[]=[];page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>{if(request.url().endsWith("/api/chat"))requests.push(request.postDataJSON());});
  try {
    buckets=await provision(f,identity.id);await page.goto("/workspace");
    await page.getByRole("textbox",{name:"Ask a question"}).fill("Why do rainbows form?");
    const responsePromise=page.waitForResponse(response=>response.url().endsWith("/api/chat"));
    await page.getByRole("button",{name:"Submit question"}).click();
    await expect(page.getByRole("status").filter({hasText:/Checking request|Understanding your question|Searching the web|Preparing an answer/u})).toBeVisible({timeout:15000});
    expect(await page.locator(".answer-prose").count()).toBe(0);
    await page.screenshot({path:`.artifacts/t11-progress-${info.project.name}.png`});
    const response=await responsePromise;expect(response.status()).toBe(200);
    await expect.poll(()=>page.evaluate(()=>window.t11Received.length),{timeout:60000}).toBe(1);
    const bytes=await page.evaluate(()=>window.t11Received[0]);expect(bytes).toContain('"type":"data-answer"');
    await expect(page.locator(".answer-prose")).toContainText("A rainbow appears");expect(bytes).not.toMatch(/PRIVATE_REASONING_MUST_NOT_LEAK|UNREVIEWED_PRIVATE_DRAFT|contentHash|passageId/);
    const prose=page.locator('.answer-prose');
    await expect(prose).toHaveAttribute('aria-busy','true');
    const firstSlice=await prose.textContent()??'';
    await expect.poll(async()=>(await prose.textContent()??'').length).toBeGreaterThan(firstSlice.length);
    expect((await prose.textContent()??'').startsWith(firstSlice)).toBe(true);
    await expect(prose).toHaveAttribute('aria-busy','false',{timeout:6000});
    expect(bytes.indexOf('"type":"text-delta"')).toBeGreaterThan(bytes.indexOf('"stage":"SAVING_ANSWER"'));
    await writeFile(`.artifacts/t11-wire-${info.project.name}.json`,JSON.stringify(await page.evaluate(()=>window.t11Timings[0]),null,2));
    await writeFile(`.artifacts/launch-stream-${info.project.name}.json`,JSON.stringify({timing:response.request().timing(),serverTiming:response.headers()["server-timing"],contentType:response.headers()["content-type"],cacheControl:response.headers()["cache-control"]},null,2));
    const submitted=requests[0] as {clientRequestId:string;conversationId:string};expect(Object.keys(submitted).sort()).toEqual(["clientRequestId","conversationId","expectedRevision","message","mode","modelKey"]);
    await expect(page.locator("h1")).toHaveText("Why do rainbows form?");expect(requests).toHaveLength(1);
    const feedback=page.getByRole('button',{name:'Helpful answer',exact:true});await expect(feedback).toBeEnabled();await feedback.click();await expect(feedback).toHaveAttribute('aria-pressed','true');
    const rendered=await page.locator(".answer-prose").textContent();
    await page.reload();await expect(page.locator(".answer-prose")).toHaveText(rendered??"");
    await expect(page.locator('.answer-prose')).toHaveAttribute('aria-busy','false');
    await expect(page.getByRole('button',{name:'Show full answer',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Helpful answer',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.waitForTimeout(100); // Flush paint observers for the saved-answer lab sample.
    await writeFile(`.artifacts/launch-answer-performance-${info.project.name}.json`,JSON.stringify(await page.evaluate(()=>({
      ...window.t11Rendering,jsTransferBytes:performance.getEntriesByType("resource").filter(r=>r.name.includes(".js")).reduce((n,r)=>n+(r as PerformanceResourceTiming).transferSize,0),
    })),null,2));
    await expect(page.locator(".answer-prose")).toHaveCSS("font-size","16px");
    await context.grantPermissions(["clipboard-read","clipboard-write"]);
    const animation=await context.newCDPSession(page);
    await animation.send("Animation.enable");await animation.send("Animation.setPlaybackRate",{playbackRate:.1});
    await page.getByRole("button",{name:"Copy answer",exact:true}).click();
    await expect(page.getByRole("button",{name:"Answer copied",exact:true})).toBeVisible();
    const frame=bytes.split("\n").find(line=>line.startsWith('data: {"type":"data-answer"'));
    expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(JSON.parse(frame!.slice(6)).data.text);
    // Observe the actual CSS transition at 10% speed without changing application state.
    await page.waitForTimeout(300);
    await page.screenshot({path:`.artifacts/launch-copy-slow-${info.project.name}.png`});
    await animation.send("Animation.setPlaybackRate",{playbackRate:1});
    await page.emulateMedia({reducedMotion:"reduce"});
    await expect(page.locator(".copy-symbol").first()).toHaveCSS("transition-duration","0s");
    await page.emulateMedia({reducedMotion:"no-preference"});
    await animation.detach();
    await page.getByRole("button",{name:"Sources",exact:true}).click();
    const sourceSurface=info.project.name==="mobile"?page.getByRole("dialog",{name:"Answer sources"}):page.getByRole("complementary",{name:"Answer sources"});
    await expect(sourceSurface).toBeInViewport();await expect(sourceSurface.getByRole("link")).toHaveCount(3);
    await page.screenshot({path:`.artifacts/t11-sources-${info.project.name}.png`});
    if(info.project.name==="mobile"){await page.getByRole("button",{name:"Close sources"}).press("Escape");await expect(page.getByRole("dialog",{name:"Answer sources"})).not.toBeVisible();}
    const citation=page.getByRole("link",{name:/Source 1: What Causes/}).first();await expect(citation).toHaveAttribute("rel","noopener noreferrer");await citation.focus();const tooltip=page.getByRole("tooltip");await expect(tooltip).toBeVisible();
    const bounds=await tooltip.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({path:`.artifacts/t11-citation-${info.project.name}.png`});
    await page.getByRole("button",{name:"3 sources",exact:true}).focus();
    expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
    await page.getByRole("article",{name:"Your question"}).scrollIntoViewIfNeeded();
    if(info.project.name==="desktop"){
      const composer=await page.locator(".thread-bottom .research-composer").boundingBox();
      expect(composer).toMatchObject({x:132,width:720,height:96});
    }
    await page.screenshot({path:`.artifacts/t11-answer-${info.project.name}.png`,fullPage:true});
    if(info.project.name==="desktop"){
      const original=page.viewportSize()!;
      for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:800});expect(await page.locator(".answer-topbar").evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
      await page.setViewportSize(original);
    }
    expect(errors).toEqual([]);
    // Same HTTP intent recovers the existing answer rather than another provider attempt.
    const [run]=await f.owner.select().from(schema.runs).where(eq(schema.runs.clientRequestId,submitted.clientRequestId));
    const beforeCalls=await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,run.id));
    expect(beforeCalls.filter(call=>call.stage!=="EXTRACT").map(call=>call.stage).sort()).toEqual(["INPUT_SAFETY","PLANNER","QUERY_SAFETY","SEARCH","EVIDENCE_SAFETY","ANSWER","OUTPUT_SAFETY"].sort());
    expect(beforeCalls.filter(call=>call.stage==="EXTRACT").length).toBeLessThanOrEqual(1);
    expect(beforeCalls.length).toBeLessThanOrEqual(8); // Extraction is optional under the absolute deadline.
    const duplicate=await context.request.post("/api/chat",{headers:{Origin:"http://localhost:3001"},data:submitted});expect(duplicate.status()).toBe(200);expect(await duplicate.text()).toContain('"type":"data-answer"');
    const afterCalls=await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,run.id));
    expect(afterCalls.map(call=>call.id).sort()).toEqual(beforeCalls.map(call=>call.id).sort());
    expect(await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,run.id))).toHaveLength(1);
    const stranger=await browser.newContext({baseURL:"http://localhost:3001"});const other=await identityFixture(stranger,"Other reader");
    try {expect((await stranger.request.get(`/api/runs/${run.id}`)).status()).toBe(404);const [approved]=await f.owner.select().from(schema.outputReviews).where(eq(schema.outputReviews.runId,run.id));expect((await stranger.request.put(`/api/messages/${approved.messageId}/feedback`,{headers:{Origin:'http://localhost:3001'},data:{rating:'NOT_HELPFUL',reason:'FALSE_REFUSAL',expectedVersion:0}})).status()).toBe(404);}finally{await other.cleanup();await stranger.close();}
  } finally {
    if(requests.length&&info.status!=="passed"){const value=requests[0] as {clientRequestId:string};const [run]=await f.owner.select().from(schema.runs).where(eq(schema.runs.clientRequestId,value.clientRequestId));if(run){console.info({state:run.status,ageMs:Date.now()-run.createdAt.getTime()});console.info((await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,run.id))).map(c=>({stage:c.stage,status:c.status,durationMs:c.finishedAt?c.finishedAt.getTime()-c.startedAt.getTime():null})));}}
    await identity.cleanup();if(buckets.length)await f.owner.delete(schema.operatorUsageBuckets).where(inArray(schema.operatorUsageBuckets.id,buckets));await f.close();}
});
for(const reduced of [false,true])test(`approved reveal ${reduced?'respects reduced motion':'can be skipped without another request'}`,async({page,context},info)=>{
 const identity=await identityFixture(context),f=createNeonFixture();let buckets:string[]=[];
 const requests:string[]=[];page.on('request',request=>{if(request.url().endsWith('/api/chat'))requests.push(request.url());});
 try{
  await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
  buckets=await provision(f,identity.id);await page.goto('/workspace');
  await page.getByRole('textbox',{name:'Ask a question'}).fill('Why do rainbows form?');
  await page.getByRole('button',{name:'Submit question'}).click();
  const prose=page.locator('.answer-prose');
  if(reduced){
   await expect(prose).toContainText('A rainbow appears',{timeout:60000});
   await expect(prose).toHaveAttribute('aria-busy','false');
   await expect(page.getByRole('button',{name:'Show full answer',exact:true})).toHaveCount(0);
  }else{
   await expect(prose).toHaveAttribute('aria-busy','true',{timeout:60000});
   await page.getByRole('button',{name:'Show full answer',exact:true}).click();
   await expect(prose).toHaveAttribute('aria-busy','false');
   await expect(page.getByRole('article',{name:'Approved answer'})).toBeFocused();
  }
  await expect(prose).toContainText('each observer sees their own rainbow');
  expect(requests).toHaveLength(1);
  const full=await prose.textContent();await page.reload();await expect(prose).toHaveText(full??'');
  await expect(prose).toHaveAttribute('aria-busy','false');
  await page.screenshot({path:`.artifacts/reveal-${reduced?'reduced':'skipped'}-${info.project.name}.png`});
 }finally{await identity.cleanup();if(buckets.length)await f.owner.delete(schema.operatorUsageBuckets).where(inArray(schema.operatorUsageBuckets.id,buckets));await f.close();}
});
for(const scenario of ["input-block","output-block","invalid-citation","search-failure","search-deadline","no-evidence"] as const){
  test(`public ${scenario} keeps private content out of the stream and history`,async({page,context},info)=>{
    const identity=await identityFixture(context),f=createNeonFixture();let buckets:string[]=[];
    const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));await observeChatWire(page);
    try {
      buckets=await provision(f,identity.id);await page.goto("/workspace");
      await page.getByRole("textbox",{name:"Ask a question"}).fill(`t11-${scenario}: explain rainbow formation`);
      const request=page.waitForRequest(request=>request.url().endsWith("/api/chat"));
      await page.getByRole("button",{name:"Submit question"}).click();const submitted=(await request).postDataJSON();
      await expect.poll(()=>page.evaluate(()=>window.t11Received.length),{timeout:60000}).toBe(1);
      const bytes=await page.evaluate(()=>window.t11Received[0]);expect(bytes).not.toMatch(/PRIVATE_REASONING_MUST_NOT_LEAK|UNREVIEWED_PRIVATE_DRAFT|PRIVATE_UPSTREAM_MUST_NOT_LEAK|passageId|contentHash/);
      const [run]=await f.owner.select().from(schema.runs).where(eq(schema.runs.clientRequestId,submitted.clientRequestId));
      const calls=await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,run.id));
      const [receipt]=await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,run.id));expect(receipt.creditsCharged).toBe(0);
      if(scenario==="no-evidence"){
        await expect(page.locator(".answer-prose")).toContainText("I couldn’t find enough usable evidence");
        expect(bytes).toContain('"type":"data-answer"');expect(bytes).not.toContain('"type":"source-url"');
        expect(calls.find(call=>call.stage==="ANSWER")?.status).toBe("SKIPPED");
      }else{
        await expect(page.locator(".research-failure [role=alert]")).toBeVisible();expect(bytes).toContain('"type":"error"');expect(bytes).not.toContain('"type":"text-delta"');
        await expect(page.locator(".answer-prose")).toHaveCount(0);
      }
      if(scenario==="input-block"){expect(calls.map(call=>call.stage)).toEqual(["INPUT_SAFETY"]);expect(bytes).not.toContain('"type":"data-stage"');}
      if(scenario==="invalid-citation")expect(calls.some(call=>call.stage==="OUTPUT_SAFETY")).toBe(false);
      if(scenario==="search-failure"||scenario==="search-deadline")expect(calls.some(call=>call.stage==="ANSWER")).toBe(false);
      if(scenario==="search-deadline"){
        expect(run.status).toBe('TIMED_OUT');expect(calls.find(call=>call.stage==='SEARCH')?.status).toBe('UNKNOWN');
        expect(bytes).toContain('Research exceeded its time limit. Please start a new search.');
        await expect(page.locator('.research-failure [role=alert]')).toHaveText('This research request timed out. You can start a new search.');
      }
      const history=await context.request.get(`/api/conversations/${submitted.conversationId}/messages`);expect(history.status()).toBe(200);
      expect(await history.text()).not.toMatch(/UNREVIEWED_PRIVATE_DRAFT|PRIVATE_REASONING_MUST_NOT_LEAK|PRIVATE_UPSTREAM_MUST_NOT_LEAK/);
      if(scenario==="input-block")expect((await history.json()).items).toEqual([]);
      expect(errors).toEqual([]);expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
      await page.screenshot({path:`.artifacts/t11-${scenario}-${info.project.name}.png`,fullPage:true});
      if(scenario==='input-block'||scenario==='search-failure'){
        // No reload: the failed admission already advanced the conversation revision.
        const nextRequest=page.waitForRequest(request=>request.url().endsWith('/api/chat'));
        await page.getByRole('textbox',{name:'Ask a question'}).fill('Why do rainbows form?');
        await page.getByRole('button',{name:'Submit question'}).click();
        expect((await nextRequest).postDataJSON().expectedRevision).toBe(run.admittedRevision);
        await expect(page.locator('.answer-prose')).toContainText('A rainbow appears',{timeout:60000});
      }
    }finally{await identity.cleanup();if(buckets.length)await f.owner.delete(schema.operatorUsageBuckets).where(inArray(schema.operatorUsageBuckets.id,buckets));await f.close();}
  });
}
test("stop cancels the admitted request and replay cannot restart paid work",async({page,context},info)=>{
  const identity=await identityFixture(context),f=createNeonFixture();let buckets:string[]=[];await observeChatWire(page);
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  try {
    buckets=await provision(f,identity.id);await page.goto("/workspace");
    await page.getByRole("textbox",{name:"Ask a question"}).fill("t11-stop: explain rainbow formation");
    const submittedPromise=page.waitForRequest(request=>request.url().endsWith("/api/chat"));
    await page.getByRole("button",{name:"Submit question"}).click();const submitted=(await submittedPromise).postDataJSON();
    await expect(page.getByRole("status").filter({hasText:"Searching the web"})).toBeVisible({timeout:15000});
    await page.getByRole("button",{name:"Stop research"}).click();
    await expect(page.locator(".research-failure [role=alert]")).toContainText("Research stopped");
    await expect.poll(async()=>{const [run]=await f.owner.select().from(schema.runs).where(eq(schema.runs.clientRequestId,submitted.clientRequestId));return run.status;},{timeout:15000}).toBe("CANCELLED");
    const [run]=await f.owner.select().from(schema.runs).where(eq(schema.runs.clientRequestId,submitted.clientRequestId));
    const before=await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,run.id));expect(before.some(call=>call.stage==="ANSWER")).toBe(false);
    const response=await context.request.post("/api/chat",{headers:{Origin:"http://localhost:3001"},data:submitted});expect(await response.text()).not.toContain('"type":"text-delta"');
    expect(await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,run.id))).toHaveLength(before.length);
    expect((await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,run.id)))[0].creditsCharged).toBe(0);
    await expect(page.locator(".answer-prose")).toHaveCount(0);expect(errors).toEqual([]);
    await page.screenshot({path:`.artifacts/t11-stopped-${info.project.name}.png`});
  }finally{await identity.cleanup();if(buckets.length)await f.owner.delete(schema.operatorUsageBuckets).where(inArray(schema.operatorUsageBuckets.id,buckets));await f.close();}
});

test('clarification is saved privately and a reply continues the same conversation',async({page,context})=>{
 const identity=await identityFixture(context),f=createNeonFixture();let buckets:string[]=[];
 try{
  buckets=await provision(f,identity.id);await page.goto('/workspace');
  await page.getByRole('textbox',{name:'Ask a question'}).fill('Is it better?');
  await page.getByRole('button',{name:'Submit question'}).click();
  await expect(page.locator('.answer-prose')).toHaveText('Which products are you comparing?',{timeout:60000});
  const path=new URL(page.url()).pathname,id=path.split('/').at(-1)!;
  const [first]=await f.owner.select().from(schema.runs).where(eq(schema.runs.conversationId,id));
  expect(first.status).toBe('NEEDS_CLARIFICATION');
  expect((await f.owner.select().from(schema.providerCalls).where(eq(schema.providerCalls.runId,first.id))).map(c=>c.stage).sort()).toEqual(['INPUT_SAFETY','OUTPUT_SAFETY','PLANNER']);
  expect((await f.owner.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,first.id)))[0].creditsCharged).toBe(0);
  await page.reload();await expect(page.locator('.answer-prose')).toHaveText('Which products are you comparing?');
  await page.getByRole('textbox',{name:'Ask a question'}).fill('Neon and Supabase');await page.getByRole('button',{name:'Submit question'}).click();
  await expect(page.locator('.answer-prose')).toHaveCount(2,{timeout:60000});expect(new URL(page.url()).pathname).toBe(path);
  await page.reload();await expect(page.getByRole('article',{name:'Your question'})).toHaveCount(2);
  expect(await f.owner.select().from(schema.runPlans).where(eq(schema.runPlans.conversationId,id))).toHaveLength(2);
  await page.getByRole('textbox',{name:'Ask a question'}).fill('Neon and Supabase');await page.getByRole('button',{name:'Submit question'}).click();
  // An intentionally repeated question is a new turn, not a hidden transport replay.
  await expect(page.getByRole('article',{name:'Your question'})).toHaveCount(3);
  await expect(page.locator('.answer-prose')).toHaveCount(3,{timeout:60000});
  await page.screenshot({path:'.artifacts/t13-clarification-followup.png',fullPage:true});
 }finally{await identity.cleanup();if(buckets.length)await f.owner.delete(schema.operatorUsageBuckets).where(inArray(schema.operatorUsageBuckets.id,buckets));await f.close();}
});

test('conflicting reports keep separate citations and approved additional source metadata',async({page,context},info)=>{
 const identity=await identityFixture(context),f=createNeonFixture();let buckets:string[]=[];
 try{
  buckets=await provision(f,identity.id);await page.goto('/workspace');
  await page.getByRole('textbox',{name:'Ask a question'}).fill('Compare the conflicting source reports');await page.getByRole('button',{name:'Submit question'}).click();
  await expect(page.locator('.answer-prose')).toContainText('The reports disagree',{timeout:60000});
  await expect(page.locator('.answer-prose a')).toHaveCount(2);await page.getByRole('button',{name:'Sources',exact:true}).click();
  const surface=info.project.name==='mobile'?page.getByRole('dialog',{name:'Answer sources'}):page.getByRole('complementary',{name:'Answer sources'});
  await expect(surface.getByRole('heading',{name:'Additional retrieved sources',exact:true})).toBeVisible();await expect(surface.getByRole('link')).toHaveCount(3);
  await expect(surface.getByText(/Factual support hasn’t been independently checked/).filter({visible:true})).toBeVisible();
  await expect(surface.getByText(/provider estimate/).filter({visible:true})).toHaveCount(2);
  await page.screenshot({path:`.artifacts/t16-conflicting-${info.project.name}.png`,fullPage:true});
  await page.reload();await expect(page.locator('.answer-prose')).toContainText('The reports disagree');
 }finally{await identity.cleanup();if(buckets.length)await f.owner.delete(schema.operatorUsageBuckets).where(inArray(schema.operatorUsageBuckets.id,buckets));await f.close();}
});
