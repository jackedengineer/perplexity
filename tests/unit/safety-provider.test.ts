import { expect, it, vi } from "vitest";
import { parseSafetyModel } from "@/server/ai/models";
import { createOpenRouterSafetyProvider } from "@/server/safety/openrouter";
const env = { OPENROUTER_API_KEY: "synthetic-test-key-only", MODEL_SAFETY: "test/classifier-v1", SAFETY_OPENROUTER_PROVIDER: "test-provider" };
const config = () => parseSafetyModel(env)!;
const input = { text: "Explain account security", context: [{ role: "USER" as const, text: "I own the staging app" }] };
const wire = { decision: "ALLOW", categoryCodes: [], policyVersion: "v1", retryable: null };
const envelope = (content: unknown = JSON.stringify(wire), finish_reason = "stop", extra = {}) => ({ choices: [{ finish_reason,
  message: { role: "assistant", content, ...extra } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
const json = (value: unknown) => new Response(JSON.stringify(value),{ headers: { "content-type": "application/json" } });
it("requires all three server settings and never returns a malformed secret in an error", () => {
  expect(parseSafetyModel(env)).toMatchObject({ modelId: env.MODEL_SAFETY, provider: "test-provider" });
  for (const change of [{ OPENROUTER_API_KEY: "" },{ MODEL_SAFETY: "https://evil.test/model" },{ SAFETY_OPENROUTER_PROVIDER: "" },{ OPENROUTER_API_KEY: "private\nheader" }]) {
    expect(parseSafetyModel({ ...env,...change })).toBeUndefined();
  }
  expect(parseSafetyModel({})).toBeUndefined();
});
it("uses one isolated, tool-free, nonstreaming strict-schema request with fixed privacy/routing controls", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(envelope()));
  const provider = createOpenRouterSafetyProvider(config(),fetcher);
  expect(await provider.classify(input,new AbortController().signal)).toEqual({ decision: "ALLOW", categoryCodes: [], policyVersion: "v1" });
  const [url,options] = fetcher.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(options).toMatchObject({ method: "POST", cache: "no-store", redirect: "error", credentials: "omit" });
  const body = JSON.parse(options!.body as string);
  expect(body).toMatchObject({ model: "test/classifier-v1", stream: false, max_completion_tokens: 384, tools: [], tool_choice: "none",
    provider: { only: ["test-provider"], allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true },
    response_format: { type: "json_schema", json_schema: { strict: true, schema: { additionalProperties: false } } } });
  expect(body.messages.map((item: { role: string })=>item.role)).toEqual(["system","user"]);
  expect(JSON.parse(body.messages[1].content)).toEqual(input);
  expect(body.messages[0].content).toContain("v1");
  expect(body.messages[0].content).not.toContain(input.text);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("maps consistent BLOCK/UNAVAILABLE wire objects and discards reasoning fields", async () => {
  for (const verdict of [{ decision: "BLOCK", categoryCodes: ["FRAUD"], policyVersion: "v1", retryable: null },
    { decision: "UNAVAILABLE", categoryCodes: [], policyVersion: "v1", retryable: true }]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(envelope(JSON.stringify(verdict),"stop",{ reasoning: "PRIVATE REASONING" })));
    const result = await createOpenRouterSafetyProvider(config(),fetcher).classify(input,new AbortController().signal);
    expect(result).toMatchObject({ decision: verdict.decision, policyVersion: "v1" });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  }
});
it("rejects truncated/refused/tool-call/multiple-choice responses and conflicting verdicts", async () => {
  for (const value of [envelope(null),envelope("```json\n{}\n```"),envelope(JSON.stringify(wire),"length"),
    envelope(JSON.stringify(wire),"stop",{ tool_calls: [{ type: "function" }] }),envelope(JSON.stringify(wire),"stop",{ refusal: "refused" }),
    { choices: [...envelope().choices,...envelope().choices] },{ ...envelope(),error: { message: "PRIVATE failure" } },
    ...[{ ...wire,categoryCodes: ["FRAUD"] },{ ...wire,explanation: "PRIVATE" },{ ...wire,policyVersion: "v0" },
      { ...wire,decision: "BLOCK" },{ ...wire,retryable: true },{ ...wire,decision: "UNAVAILABLE" }].map((v)=>envelope(JSON.stringify(v)))]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(value));
    await expect(createOpenRouterSafetyProvider(config(),fetcher).classify(input,new AbortController().signal)).rejects.toMatchObject({ reason: "MALFORMED_OUTPUT" });
  }
});
it("caps actual response bytes, rejects non-JSON/error HTTP and makes no retry", async () => {
  for (const response of [new Response("PRIVATE HTTP failure",{ status: 500 }),new Response("PRIVATE html"),
    json({ padding: "x".repeat(16385) }),json(envelope(JSON.stringify({ ...wire, padding: "x".repeat(3000) })))]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(createOpenRouterSafetyProvider(config(),fetcher).classify(input,new AbortController().signal)).rejects.toThrow("Safety classifier unavailable.");
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it("bounds serialized outbound bytes and enforces classifier price ceilings", async()=>{
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(envelope()));
  const classifier = createOpenRouterSafetyProvider(config(),fetcher);
  await classifier.classify(input,new AbortController().signal);
  const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(body.provider.max_price).toEqual({ prompt: 0.1,completion: 0.4,request: 0 });
  fetcher.mockClear();
  await expect(classifier.classify({ text: "x".repeat(45001),context: [] },new AbortController().signal)).rejects.toThrow("Safety classifier unavailable.");
  expect(fetcher).not.toHaveBeenCalled();
});
it("caps chunked response bytes even when stream cancellation does not settle", async()=>{
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(16385)); },
    cancel() { cancelled=true; return new Promise<void>(()=>undefined); } });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body,{ headers: { "content-type": "application/json" } }));
  await expect(createOpenRouterSafetyProvider(config(),fetcher).classify(input,new AbortController().signal)).rejects.toMatchObject({ reason: "MALFORMED_OUTPUT" });
  expect(cancelled).toBe(true);
},1000);
it("uses an evidence-specific system policy without treating sources as trusted history",async()=>{
  const { EVIDENCE_SAFETY_PROMPT,createEvidenceGate } = await import("@/server/safety/evidence");
  const { buildEvidence } = await import("@/server/search/evidence");
  const { randomUUID } = await import("node:crypto");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(envelope()));
  const evidence = buildEvidence(randomUUID(),[{ title: "Synthetic evidence",url: "https://example.org/source",content: "A source excerpt.",score: 0.8 }],new Date());
  const gate = createEvidenceGate(createOpenRouterSafetyProvider(config(),fetcher,EVIDENCE_SAFETY_PROMPT));
  expect((await gate.evaluate(evidence,{ signal: new AbortController().signal,deadlineAt: new Date(Date.now()+10000) })).verdict.decision).toBe("ALLOW");
  const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(body.messages[0].content).toContain("UNTRUSTED SOURCE DATA");
  expect(body.messages[0].content).not.toContain("A source excerpt.");
  expect(body.messages[1].role).toBe("user");
  expect(JSON.parse(body.messages[1].content).context[0].role).toBe("ASSISTANT");
  expect(body).toMatchObject({ tools: [],tool_choice: "none",stream: false });
});
