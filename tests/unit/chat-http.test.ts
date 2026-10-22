import { randomUUID } from "node:crypto";
import { expect,it,vi } from "vitest";
import { DefaultChatTransport } from "ai";
import { createChatHttp } from "@/server/chat/http";
import { AdmissionError } from "@/server/runs/errors";
import type { CommittedAnswer,ResearchMessage } from "@/server/chat/views";
const subject = { user: { id: "synthetic-subject" },sessionId: randomUUID() };
const input = ()=>({ conversationId: randomUUID(),clientRequestId: randomUUID(),expectedRevision: 0,mode: "FAST",modelKey: "fast-default",message: { text: "Why do rainbows form?" } });
function fixture() {
  const question = input(),run = { id: randomUUID(),conversationId: question.conversationId,revision: 1,status: "RECEIVED" as const,deadlineAt: new Date(Date.now()+45000).toISOString() };
  const answer: CommittedAnswer = { runId: run.id,conversationId: run.conversationId,revision: 1,messageId: randomUUID(),text: "Light bends [S1].",createdAt: new Date().toISOString(),
    answer: { kind: "ANSWER",document: [{ type: "paragraph",children: [{ type: "text",text: "Light bends " },{ type: "citation",number: 1 }] }],sources: [{ sourceId: "S1",number: 1,url: "https://weather.gov/rainbow",title: "Rainbow evidence",domain: "weather.gov",supportStatus: "NOT_CHECKED" }] } };
  const backend = { admit: vi.fn().mockResolvedValue({ kind: "ADMITTED",run }),execute: vi.fn().mockResolvedValue({ kind: "COMPLETED" }),load: vi.fn().mockResolvedValue({runId: run.id,conversationId: run.conversationId,revision: 1,state: "COMPLETED",answer}) };
  const dependencies = { identity: vi.fn().mockResolvedValue(subject),origin: ()=>"http://localhost:3000",backend: ()=>backend,load: backend.load,consumeRequest:vi.fn().mockResolvedValue(undefined),log: vi.fn() };
  const http = createChatHttp(dependencies);
  const request = (body: unknown = question,headers: Record<string,string> = {})=>new Request("http://localhost:3000/api/chat",{method: "POST",headers:{origin: "http://localhost:3000","content-type": "application/json",...headers},body: JSON.stringify(body)});
  return {question,run,answer,backend,dependencies,http,request};
}
it("uses the installed SDK protocol and sends only the newest question contract",async()=>{
  const f=fixture();const sent: unknown[]=[];
  const transport = new DefaultChatTransport<ResearchMessage>({api:"http://localhost:3000/api/chat",prepareSendMessagesRequest:()=>({body:f.question}),
    fetch: async(url,init)=>{sent.push(JSON.parse(String(init?.body)));return f.http.post(new Request(String(url),{...init,headers:{...init?.headers,origin:"http://localhost:3000"}}));} });
  const stream = await transport.sendMessages({chatId:randomUUID(),trigger:"submit-message",messages:[],messageId:undefined,abortSignal:undefined});
  const chunks=[];for await (const chunk of stream) chunks.push(chunk);
  expect(sent).toEqual([f.question]);expect(chunks.find(c=>c.type === "text-delta")).toMatchObject({delta:f.answer.text});
  expect(chunks.find(c=>c.type === "source-url")).toMatchObject({url:"https://weather.gov/rainbow"});
  expect(chunks.at(-1)).toMatchObject({type:"finish",finishReason:"stop"});
});
it("releases no answer/source bytes while execution and canonical loading are pending",async()=>{
  const f=fixture();let release!:()=>void;
  f.backend.execute.mockImplementation(async(_identity,_run,_input,_signal,onStage)=>{onStage("SEARCHING");await new Promise<void>(resolve=>{release=resolve;});return {kind:"COMPLETED"};});
  const response=await f.http.post(f.request()),reader=response.body!.getReader();
  const first=new TextDecoder().decode((await reader.read()).value);
  expect(first).not.toMatch(/Light bends|Rainbow evidence|weather.gov/);
  await vi.waitFor(()=>expect(release).toBeTypeOf("function"));expect(f.backend.load).not.toHaveBeenCalled();release();
  let rest="";for(;;){const next=await reader.read();if(next.done)break;rest+=new TextDecoder().decode(next.value);}
  expect(rest).toContain("Light bends");expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
});
it("provider failure emits a fixed in-band error and no answer bytes",async()=>{
  const f=fixture();f.backend.execute.mockRejectedValue(new Error("PRIVATE DRAFT and secret upstream details"));
  const response=await f.http.post(f.request()),bytes=await response.text();
  expect(response.status).toBe(200);expect(bytes).toContain('"type":"error"');expect(bytes).toContain('"type":"finish"');
  expect(bytes).not.toMatch(/PRIVATE|Light bends|weather.gov|text-delta|source-url/);expect(f.backend.load).not.toHaveBeenCalled();expect(JSON.stringify(f.dependencies.log.mock.calls)).not.toContain("PRIVATE");
});
it("duplicate running intents return a recoverable run ID without starting providers",async()=>{
  const f=fixture();f.backend.admit.mockResolvedValue({kind:"RUN_IN_PROGRESS",run:f.run});
  const response=await f.http.post(f.request());expect(response.status).toBe(409);expect(response.headers.get("x-run-id")).toBe(f.run.id);
  expect(f.backend.execute).not.toHaveBeenCalled();
  expect(f.dependencies.log).toHaveBeenCalledWith(expect.objectContaining({event:'chat.admission',outcome:'RUN_IN_PROGRESS',category:'state'}));
});
it("completed retries load canonical state and never execute providers",async()=>{
  const f=fixture();f.backend.admit.mockResolvedValue({kind:"RUN_ALREADY_FINISHED",run:f.run});
  expect(await (await f.http.post(f.request())).text()).toContain("Light bends");expect(f.backend.execute).not.toHaveBeenCalled();
});
it("database failure after execution exposes no answer",async()=>{
  const f=fixture();f.backend.load.mockRejectedValue(new Error("PRIVATE SQL PARAMETERS"));
  const bytes=await (await f.http.post(f.request())).text();expect(bytes).not.toMatch(/Light bends|PRIVATE|source-url/);expect(bytes).toContain('"type":"error"');
});
it.each([{messages:[]},{model:"unsafe"},{safety:{disabled:true}},{userId:"other"}])("rejects browser history/provider/auth overrides",async(extra)=>{
  const f=fixture();expect((await f.http.post(f.request({...f.question,...extra}))).status).toBe(422);expect(f.backend.admit).not.toHaveBeenCalled();
});
it("checks identity, origin and request size before admission",async()=>{
  const f=fixture();f.dependencies.identity.mockResolvedValue(null);expect((await f.http.post(f.request())).status).toBe(401);
  f.dependencies.identity.mockResolvedValue(subject);expect((await f.http.post(f.request(f.question,{origin:"https://evil.example"}))).status).toBe(403);
  expect((await f.http.post(f.request({...f.question,message:{text:"x".repeat(17000)}}))).status).toBe(413);expect(f.backend.admit).not.toHaveBeenCalled();
});
it("stream cancellation propagates to execution",async()=>{
  const f=fixture();let active: AbortSignal|undefined;
  f.backend.execute.mockImplementation(async(_a,_b,_c,signal,onStage)=>{active=signal;onStage("SEARCHING");await new Promise<void>(resolve=>signal.addEventListener("abort",()=>resolve(),{once:true}));return {kind:"DENIED",code:"PROVIDER_UNAVAILABLE"};});
  const response=await f.http.post(f.request());await vi.waitFor(()=>expect(active).toBeDefined());await response.body!.cancel();await vi.waitFor(()=>expect(active!.aborted).toBe(true));
});
it("status responses require identity and sanitize missing/foreign IDs",async()=>{
  const f=fixture();f.backend.load.mockRejectedValue(new AdmissionError("NOT_FOUND"));
  const response=await f.http.get(new Request("http://localhost:3000/api/runs/foreign"),randomUUID());expect(response.status).toBe(404);expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("operator namespaces are server-only configuration and cannot alter stage/price caps",async()=>{
  const { parseAdmissionPolicyEnvironment } = await import("@/server/runs/env");
  const selected=parseAdmissionPolicyEnvironment({RUN_OPERATOR_BUDGET_KEY:"test-isolated"});
  expect(selected).toMatchObject({operatorBudgetKey:"test-isolated",answerCredits:5,providerReserveMicroUsd:50000n,deadlineMs:45000});
  expect(()=>parseAdmissionPolicyEnvironment({RUN_OPERATOR_BUDGET_KEY:"unsafe / namespace"})).toThrow();
});

it("counts malformed and unauthenticated requests before body parsing or backend configuration",async()=>{
 const f=fixture();
 expect((await f.http.post(f.request({untrusted:"PRIVATE_REQUEST"}))).status).toBe(422);
 expect(f.dependencies.consumeRequest).toHaveBeenCalledWith(subject.user.id);
 f.dependencies.identity.mockResolvedValue(null);
 expect((await f.http.post(f.request())).status).toBe(401);
 expect(f.dependencies.consumeRequest).toHaveBeenLastCalledWith(null);
 expect(f.backend.admit).not.toHaveBeenCalled();
});
it('charges cross-origin denials to anonymous abuse allocation rather than a signed-in victim',async()=>{
 const f=fixture();const response=await f.http.post(f.request(f.question,{origin:'https://untrusted.example'}));
 expect(response.status).toBe(403);expect(f.dependencies.consumeRequest).toHaveBeenCalledWith(null);
 expect(f.dependencies.consumeRequest).not.toHaveBeenCalledWith(subject.user.id);expect(f.backend.admit).not.toHaveBeenCalled();
});
it("rate denial and counter infrastructure failure cannot reach admission",async()=>{
 const f=fixture();f.dependencies.consumeRequest.mockRejectedValue(new AdmissionError("RATE_LIMITED"));
 const limited=await f.http.post(f.request());expect(limited.status).toBe(429);expect((await limited.json()).error.code).toBe("RATE_LIMITED");
 f.dependencies.consumeRequest.mockRejectedValue(new Error("PRIVATE SQL PARAMETERS"));
 const unavailable=await f.http.post(f.request());expect(unavailable.status).toBe(503);expect(await unavailable.text()).not.toContain("PRIVATE");
 expect(f.backend.admit).not.toHaveBeenCalled();
});
it.each([['RATE_LIMITED','rate'],['BUDGET_EXCEEDED','quota']] as const)('records %s admission denial separately from other outcomes',async(code,category)=>{
 const f=fixture();f.backend.admit.mockResolvedValue({kind:'DENIED',code});
 const response=await f.http.post(f.request());expect(response.status).toBe(429);
 expect(f.dependencies.log).toHaveBeenLastCalledWith(expect.objectContaining({event:'chat.admission',outcome:code,category}));
 expect(f.backend.execute).not.toHaveBeenCalled();
});
it.each([['OUTPUT_BLOCKED','policy'],['PROVIDER_UNAVAILABLE','infrastructure'],['DEADLINE_EXCEEDED','deadline']] as const)('distinguishes %s after streaming starts',async(code,category)=>{
 const f=fixture();f.backend.execute.mockRejectedValue(new AdmissionError(code));
 const response=await f.http.post(f.request());await response.text();
 expect(f.dependencies.log).toHaveBeenLastCalledWith(expect.objectContaining({event:'chat.execution',outcome:code,category}));
 expect(f.backend.load).not.toHaveBeenCalled();
});
it('correlates server-only spans and approved delivery without reflecting client diagnostics',async()=>{
 const capture=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{
  const f=fixture();f.question.message.text='PRIVATE_USER_QUESTION';
  const response=await f.http.post(f.request(f.question,{'x-request-id':'PRIVATE_CLIENT_ID',traceparent:'PRIVATE_TRACE_PARENT'}));
  const bytes=await response.text(),events=capture.mock.calls.map(args=>JSON.parse(String(args[0])));
  expect(events.length).toBeGreaterThan(0);expect(events.every(e=>e.requestId===response.headers.get('x-request-id'))).toBe(true);
  expect(events.find(e=>e.stage==='http.delivery'&&e.phase==='END')).toMatchObject({outcome:'COMPLETED',runId:f.run.id});
  expect(events.some(e=>e.event==='research.approved_delivery')).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/PRIVATE_|Light bends|weather.gov|sessionId/);
  expect(bytes).not.toMatch(/research.span|traceId|knownCostMicroUsd/);
 }finally{capture.mockRestore();}
});
it.each(['sync','async'])('a broken %s request logger cannot change admission or approved delivery',async mode=>{
 const f=fixture();f.dependencies.log.mockImplementation(()=>{if(mode==='async')return Promise.reject(Error('PRIVATE logger'));throw Error('PRIVATE logger');});
 const response=await f.http.post(f.request());expect(response.status).toBe(200);expect(await response.text()).toContain('Light bends');
 expect(f.backend.execute).toHaveBeenCalledOnce();
});
it('identifies configuration failure before admission without recording raw settings',async()=>{
 const capture=vi.spyOn(console,'info').mockImplementation(()=>{}),f=fixture();
 vi.spyOn(f.dependencies,'backend').mockImplementation(()=>{throw new AdmissionError('CONFIGURATION_UNAVAILABLE');});
 try{
  expect((await f.http.post(f.request())).status).toBe(503);
  expect(capture.mock.calls.map(args=>JSON.parse(String(args[0]))).find(e=>e.stage==='http.configuration'&&e.phase==='END')).toMatchObject({outcome:'CONFIGURATION_UNAVAILABLE'});
  expect(f.backend.admit).not.toHaveBeenCalled();expect(f.backend.execute).not.toHaveBeenCalled();
 }finally{capture.mockRestore();}
});
