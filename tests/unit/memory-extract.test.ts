import { describe, expect, it, vi } from "vitest";
import { createExtractionProvider, extractionPayload, resolveOperations, EXTRACTION_LIMITS } from "@/server/memory/extract";

const config = { apiKey: "synthetic-provider-key", modelId: "mistralai/mistral-small-3.2-24b-instruct", provider: "deepinfra/fp8" };
const options = () => ({ signal: new AbortController().signal, deadlineAt: new Date(Date.now() + 45000) });
const reply = (value: unknown, finish_reason = "stop") => Response.json({ id: "test-memory", model: config.modelId, created: 1, choices: [{ index: 0, finish_reason, message: { role: "assistant", content: typeof value === "string" ? value : JSON.stringify(value) } }], usage: { prompt_tokens: 300, completion_tokens: 40, total_tokens: 340, cost: .000031 } });
const saved = [{ id: "00000000-0000-4000-8000-000000000001", kind: "PROFILE" as const, text: "Lives in Pune" }];

describe("the extraction request", () => {
  it("sends the message and saved memories under short ids, and maps them back", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ operations: [{ op: "UPDATE", id: "m1", text: "Lives in Bengaluru" }, { op: "ADD", kind: "PROFILE", text: "Works as a civil engineer" }, { op: "DELETE", id: "m7" }] }));
    const provider = createExtractionProvider(config, fetcher);
    const result = await provider.extract({ message: "I moved to Bengaluru. I'm a civil engineer.", memories: saved }, options());
    expect(result.operations).toEqual([{ op: "UPDATE", id: saved[0].id, text: "Lives in Bengaluru" }, { op: "ADD", kind: "PROFILE", text: "Works as a civil engineer" }, { op: "DELETE", id: "" }]);
    expect(result.usage?.costMicroUsd).toBe(31n);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(JSON.parse(body.messages[1].content)).toEqual({ message: "I moved to Bengaluru. I'm a civil engineer.", memories: [{ id: "m1", kind: "PROFILE", text: "Lives in Pune" }] });
    expect(body.messages[1].content).not.toContain(saved[0].id);
    expect(body).toMatchObject({ temperature: 0, max_tokens: EXTRACTION_LIMITS.maxOutputTokens, provider: { zdr: true, data_collection: "deny" } });
  });

  it("leaves out the oldest memories rather than passing the wire cap", async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}`, kind: "CONTEXT" as const, text: `${i} ${"界".repeat(190)}` }));
    const { prompt, ids } = extractionPayload({ message: "I".repeat(2000), memories: many });
    expect(ids.length).toBeLessThan(50);
    expect(ids).toEqual(many.slice(0, ids.length).map(m => m.id));
    expect(Buffer.byteLength(prompt)).toBeLessThan(EXTRACTION_LIMITS.wireBytes);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ operations: [] }));
    await createExtractionProvider(config, fetcher).extract({ message: "我".repeat(2000), memories: many }, options());
    expect(Buffer.byteLength(String(fetcher.mock.calls[0][1]?.body))).toBeLessThanOrEqual(EXTRACTION_LIMITS.wireBytes);
  });

  it("maps only well-formed short ids", () => {
    expect(resolveOperations({ operations: [{ op: "DELETE", id: "m0" }, { op: "DELETE", id: "x1" }, { op: "DELETE", id: "m2" }] }, ["a", "b"])).toEqual([{ op: "DELETE", id: "" }, { op: "DELETE", id: "" }, { op: "DELETE", id: "b" }]);
  });
});

describe("extraction failures", () => {
  it("reports non-JSON, over-long and refused output as failures, keeping the cost", async () => {
    for (const [response, reason] of [[reply("I can't help with that"), "INVALID_OUTPUT"], [reply({ operations: [] }, "length"), "INVALID_OUTPUT"],
      [reply({ operations: Array.from({ length: 4 }, () => ({ op: "DELETE", id: "m1" })) }), "INVALID_OUTPUT"]] as const) {
      const provider = createExtractionProvider(config, vi.fn<typeof fetch>().mockResolvedValue(response));
      await expect(provider.extract({ message: "I live in Pune", memories: [] }, options())).rejects.toMatchObject({ reason });
      expect(provider.usage?.()?.costMicroUsd).toBe(31n);
    }
  });
  it("reports a transport failure as unavailable", async () => {
    const provider = createExtractionProvider(config, vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")));
    await expect(provider.extract({ message: "I live in Pune", memories: [] }, options())).rejects.toMatchObject({ reason: "UNAVAILABLE" });
  });
});
