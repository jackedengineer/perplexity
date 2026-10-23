import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { buildEvidence } from "@/server/search/evidence";
import { createAnswerProvider } from "@/server/ai/answer";
const config = { apiKey: "synthetic-key-only",modelId: "test/answer",provider: "test-provider" };
const evidence = () => buildEvidence(randomUUID(),[{ title: "Rainbows",url: "https://example.org/rainbows",content: "Water refracts sunlight.",score: 0.9 }],new Date());
const input = () => ({ question: "Why do rainbows form?",evidence: evidence() });
const options = () => ({ signal: new AbortController().signal,deadlineAt: new Date(Date.now()+45000) });
const response = (text = "Water refracts sunlight [S1].",reason = "stop") => Response.json({ id: "synthetic",model: "test/answer",created: 1,
  choices: [{ index: 0,finish_reason: reason,message: { role: "assistant",content: text,reasoning: "PRIVATE REASONING" } }],
  usage: { prompt_tokens: 100,completion_tokens: 10,total_tokens: 110,cost: 0.0000123 } });
it.each(["openai/gpt-4.1-nano","openai/gpt-4.1-mini"])("avoids unsupported reasoning parameters for %s while preserving spend/privacy controls",async(modelId)=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response());
  await createAnswerProvider({...config,modelId,provider:"azure"},fetcher).generate(input(),options());
  const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(body).not.toHaveProperty("reasoning");
  expect(body.provider).toEqual({only:["azure"],allow_fallbacks:false,require_parameters:true,data_collection:"deny",zdr:true,max_price:{prompt:.5,completion:2,request:0}});
});
it("uses the AI SDK with one bounded, private, tool-free OpenRouter call",async()=>{
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
  const result = await createAnswerProvider(config,fetcher).generate(input(),options());
  expect(result.text).toBe("Water refracts sunlight [S1]."); expect(JSON.stringify(result,(_key,value)=>typeof value === "bigint" ? String(value) : value)).not.toContain("PRIVATE REASONING");
  const [url,init] = fetcher.mock.calls[0]; expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
  const body = JSON.parse(String(init?.body)); expect(body).toMatchObject({ model: "test/answer",max_tokens: 1200,
    provider: { only: ["test-provider"],allow_fallbacks: false,data_collection: "deny",zdr: true } });
  expect(body.messages).toHaveLength(2); expect(body.messages[1].content).toContain("Water refracts sunlight.");
  expect(body.messages[1].content).not.toContain("https://example.org"); expect(fetcher).toHaveBeenCalledOnce();
});
it.each(["length","tool_calls","content_filter"])("never accepts %s as a finished draft",async(reason)=>{
  await expect(createAnswerProvider(config,vi.fn<typeof fetch>().mockResolvedValue(response("partial",reason))).generate(input(),options())).rejects.toThrow("Answer unavailable");
});
it("does not invoke an answer model when evidence is empty",async()=>{
  const fetcher = vi.fn<typeof fetch>();
  await expect(createAnswerProvider(config,fetcher).generate({ question: "hello",evidence: { runId: randomUUID(),sources: [],passages: [] } },options())).rejects.toThrow("Answer unavailable");
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["x".repeat(4001),"\u0000bad",""])("rejects unusable output without truncating it",async(text)=>{
  await expect(createAnswerProvider(config,vi.fn<typeof fetch>().mockResolvedValue(response(text))).generate(input(),options())).rejects.toThrow("Answer unavailable");
});
it("rejects pre-cancellation and expired deadlines before network calls",async()=>{
  const fetcher = vi.fn<typeof fetch>(),controller = new AbortController(); controller.abort();
  await expect(createAnswerProvider(config,fetcher).generate(input(),{ ...options(),signal: controller.signal })).rejects.toThrow("Answer unavailable");
  await expect(createAnswerProvider(config,fetcher).generate(input(),{ ...options(),deadlineAt: new Date(0) })).rejects.toThrow("Answer unavailable");
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects unselected/tampered passages before forwarding",async()=>{
  const fetcher = vi.fn<typeof fetch>(),value = input(); value.evidence.passages[0].text = "forged";
  await expect(createAnswerProvider(config,fetcher).generate(value,options())).rejects.toThrow("Answer unavailable"); expect(fetcher).not.toHaveBeenCalled();
});
it("caps response bytes and makes one attempt on provider failure",async()=>{
  for (const value of [new Response("PRIVATE upstream error",{ status: 500 }),new Response("x".repeat(24001),{ headers: { "content-type": "application/json" } })]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(value);
    await expect(createAnswerProvider(config,fetcher).generate(input(),options())).rejects.toThrow("Answer unavailable"); expect(fetcher).toHaveBeenCalledOnce();
  }
});
it("cancels a non-cooperative SDK request under the original deadline",async()=>{
  const fetcher = vi.fn<typeof fetch>(()=>new Promise(()=>{}));
  await expect(createAnswerProvider(config,fetcher).generate(input(),{ ...options(),deadlineAt: new Date(Date.now()+20) })).rejects.toThrow("Answer unavailable");
  expect(fetcher).toHaveBeenCalledOnce();
});
