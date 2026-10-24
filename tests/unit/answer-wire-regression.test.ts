import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createAnswerProvider } from "@/server/ai/answer";
import { questionTextSchema } from "@/server/contracts/chat";
import { buildEvidence, validateEvidence } from "@/server/search/evidence";

it("dispatches a bounded answer request for a maximum multibyte original with complete selected evidence", async () => {
  const question = questionTextSchema.parse("界".repeat(4000));
  const evidence = buildEvidence(
    randomUUID(),
    Array.from({ length: 5 }, (_, index) => ({
      title: `Source ${index + 1}`,
      url: `https://example.org/${index + 1}`,
      content: "光".repeat(1000),
      score: 0.9,
    })),
    new Date("2026-10-24T07:30:00.000Z"),
  );
  expect(validateEvidence(evidence)).not.toBeNull();
  expect(evidence.passages.length).toBeGreaterThan(1);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    id: "synthetic", model: "test/answer", created: 1,
    choices: [{
      index: 0, finish_reason: "stop", message: {
        role: "assistant",
        content: JSON.stringify({ paragraphs: [{ text: "A bounded sourced answer.", sourceIds: ["S1"] }] }),
      },
    }],
    usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, cost: 0.0000123 },
  }));

  await createAnswerProvider({
    apiKey: "synthetic-key-only", modelId: "test/answer", provider: "test-provider",
  }, fetcher).generate({ question, interpretation: question, evidence }, {
    signal: new AbortController().signal,
    deadlineAt: new Date(Date.now() + 45000),
  });

  expect(fetcher).toHaveBeenCalledOnce();
  const body = String(fetcher.mock.calls[0][1]?.body);
  expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(20000);
  const payload = JSON.parse(JSON.parse(body).messages[1].content);
  expect(payload.question).toBe(question);
  expect(payload.passages.length).toBeGreaterThan(0);
  for (const passage of payload.passages) {
    // A whole selected passage may be omitted to fit the envelope. Neither the
    // original question nor an included passage may be clipped or rewritten.
    expect(evidence.passages.find(item => item.sourceId === passage.sourceId)?.text).toBe(passage.text);
  }
});

it('restricts citation IDs to whole passages actually forwarded and keeps selection stable',async()=>{
 const {prepareDraftInput}=await import('@/server/ai/draft-input');
 const evidence=buildEvidence(randomUUID(),Array.from({length:5},(_,index)=>({title:`Source ${index}`,url:`https://example.org/${index}`,content:'光'.repeat(1000),score:.9})),new Date());
 const prepared=prepareDraftInput({question:'界'.repeat(4000),evidence});
 expect(prepared.evidence.sources.length).toBeLessThan(evidence.sources.length);
 expect(prepared.evidence.sources.map(s=>s.sourceId)).toEqual(prepared.evidence.passages.map(p=>p.sourceId));
 expect(prepareDraftInput(prepared)).toEqual(prepared);
 expect(evidence.sources.length).toBeGreaterThan(1);
});
