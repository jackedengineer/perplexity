import { randomUUID } from "node:crypto";
import { expect,it,vi } from "vitest";
import { createResearchTransport } from "@/components/conversations/research-transport";
it("sends one stable newest-question intent and never forwards SDK conversation history",async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{message:"Research is temporarily unavailable. Please try again later."}},{status:503}));
  const controller=createResearchTransport(vi.fn(),request);
  const intent={conversationId:randomUUID(),clientRequestId:randomUUID(),expectedRevision:0,message:{text:"Why rainbows?"},mode:"FAST" as const,modelKey:"fast-default" as const};
  controller.setIntent(intent);
  const options={chatId:randomUUID(),trigger:"submit-message" as const,messageId:undefined,abortSignal:undefined,messages:[{id:randomUUID(),role:"assistant" as const,parts:[{type:"text" as const,text:"CLIENT_INVENTED_HISTORY"}]}]};
  await expect(controller.transport.sendMessages(options)).rejects.toThrow("Research is temporarily unavailable");
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual(intent);
  expect(String(request.mock.calls[0][1]?.body)).not.toContain("CLIENT_INVENTED_HISTORY");
});
it("keeps recovery metadata and sanitizes unexpected HTTP bodies",async()=>{
  const runId=randomUUID(),unauthenticated=vi.fn();
  const controller=createResearchTransport(unauthenticated,vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{message:"PRIVATE SQL and upstream secrets"}},{status:401,headers:{"x-run-id":runId}})));
  controller.setIntent({conversationId:randomUUID(),clientRequestId:randomUUID(),expectedRevision:0,message:{text:"Synthetic"},mode:"FAST",modelKey:"fast-default"});
  await expect(controller.transport.sendMessages({chatId:randomUUID(),trigger:"submit-message",messageId:undefined,abortSignal:undefined,messages:[]})).rejects.toThrow("Research is temporarily unavailable");
  expect(unauthenticated).toHaveBeenCalledOnce();expect(controller.getRunId()).toBe(runId);
});
