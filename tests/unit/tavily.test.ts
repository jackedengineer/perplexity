import { expect, it, vi } from "vitest";
import { createTavilySearch } from "@/server/search/tavily";

const fixture = { query: "Why do rainbows form?", results: [{ title: "Rainbows", url: "https://example.org/rainbows", content: "Water refracts sunlight.", score: 0.8 }], usage: { credits: 1 } };
const options = () => ({ signal: new AbortController().signal, deadlineAt: new Date(Date.now()+10_000) });
it("uses one fixed endpoint and server-owned parameters, ignoring generated answer prose", async()=>{
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...fixture, answer: "Never use this", images: [] }));
  const result = await createTavilySearch("test-key",request).search(fixture.query,options());
  const [url,init] = request.mock.calls[0];
  expect(url).toBe("https://api.tavily.com/search");
  expect(init).toMatchObject({ redirect: "error", credentials: "omit", cache: "no-store" });
  expect(JSON.parse(String(init?.body))).toMatchObject({ max_results: 5, search_depth: "basic", auto_parameters: false,
    include_answer: false, include_raw_content: false, include_images: false, include_usage: true });
  expect(result).toEqual({ results: fixture.results, credits: 1 }); expect(request).toHaveBeenCalledOnce();
});
it.each(["", "x".repeat(301), "bad\u0000query", { query: "hello", max_results: 100 }])("rejects invalid query before network: %j", async(query)=>{
  const request = vi.fn<typeof fetch>();
  await expect(createTavilySearch("test",request).search(query,options())).rejects.toThrow("Retrieval unavailable");
  expect(request).not.toHaveBeenCalled();
});
it.each([{ results: [] }, { results: Array(6).fill(fixture.results[0]) }, { ...fixture, usage: { credits: 2 } },
  { ...fixture, results: [{ ...fixture.results[0], content: 42 }] }])("fails closed on malformed or over-budget responses", async(body)=>{
  await expect(createTavilySearch("test",vi.fn<typeof fetch>().mockResolvedValue(Response.json(body))).search("hello",options())).rejects.toThrow("Retrieval unavailable");
});
it("accepts a zero-result search without inventing evidence", async()=>{
  const result = await createTavilySearch("test",vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...fixture,results: [] }))).search("hello",options());
  expect(result).toEqual({ results: [],credits: 1 });
});
it("cancels a non-cooperative request on caller abort with no retry or raw error", async()=>{
  const controller = new AbortController(), request = vi.fn<typeof fetch>(()=>new Promise(()=>{}));
  const pending = createTavilySearch("test",request).search("hello",{ ...options(),signal: controller.signal });
  controller.abort("private reason"); await expect(pending).rejects.toThrow("Retrieval unavailable"); expect(request).toHaveBeenCalledTimes(0);
});
it("enforces an absolute deadline even if provider ignores the signal", async()=>{
  const request = vi.fn<typeof fetch>(()=>new Promise(()=>{}));
  await expect(createTavilySearch("test",request).search("hello",{ ...options(),deadlineAt: new Date(Date.now()+15) })).rejects.toThrow("Retrieval unavailable");
  expect(request).toHaveBeenCalledOnce();
});
it.each([new Response("private provider error",{ status: 500 }),new Response("{}",{ headers: { "content-type": "text/html" } }),
  new Response("x".repeat(100_001),{ headers: { "content-type": "application/json" } })])("rejects provider errors and oversized bodies", async(response)=>{
  await expect(createTavilySearch("test",vi.fn<typeof fetch>().mockResolvedValue(response)).search("hello",options())).rejects.toThrow("Retrieval unavailable");
});
it("aborts an in-flight body read even when the response stream never closes",async()=>{
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }),{ headers: { "content-type": "application/json" } });
  const request = vi.fn<typeof fetch>().mockResolvedValue(response);
  await expect(createTavilySearch("test",request).search("hello",{ ...options(),deadlineAt: new Date(Date.now()+20) })).rejects.toThrow("Retrieval unavailable");
  expect(cancelled).toBe(true);
});
it("rejects a late successful response after a delayed timeout callback",async()=>{
  const now = Date.now();
  const request = vi.fn<typeof fetch>(async()=>{
    vi.spyOn(Date,"now").mockReturnValue(now+10_000);
    return Response.json(fixture);
  });
  try { await expect(createTavilySearch("test",request).search("hello",options())).rejects.toThrow("Retrieval unavailable"); }
  finally { vi.restoreAllMocks(); }
});
it("forwards cancellation after request start, without exposing the caller reason",async()=>{
  const controller = new AbortController(); let providerSignal: AbortSignal | undefined;
  const request = vi.fn<typeof fetch>(async(_url,init)=>{ providerSignal = init?.signal ?? undefined; controller.abort("private reason"); return Response.json(fixture); });
  await expect(createTavilySearch("test",request).search("hello",{ ...options(),signal: controller.signal })).rejects.toThrow("Retrieval unavailable");
  expect(providerSignal?.aborted).toBe(true); expect(providerSignal?.reason).not.toBe("private reason"); expect(request).toHaveBeenCalledOnce();
});
it("requires a usable key and never calls the provider for an expired deadline",async()=>{
  expect(()=>createTavilySearch("")).toThrow("Retrieval unavailable");
  const request = vi.fn<typeof fetch>();
  await expect(createTavilySearch("test",request).search("hello",{ ...options(),deadlineAt: new Date(0) })).rejects.toThrow("Retrieval unavailable");
  expect(request).not.toHaveBeenCalled();
});
