import { randomUUID } from "node:crypto";
import { expect,it } from "vitest";
import { approvedPayloadSchema } from "@/server/contracts/answer";
import { isApprovedResponse } from "@/server/safety/release";
const payload = () => ({ runId: randomUUID(),attemptVersion: 1,revision: 1,policyVersion: "v1",kind: "ANSWER",markdown: "Supported [S1].",
  sources: [{ sourceId: "S1",number: 1,url: "https://example.org/",title: "Source",publishedAt: null,passageIds: [randomUUID()],contentHashes: ["a".repeat(64)],supportStatus: "NOT_CHECKED" }] });
it("does not confuse a valid stored shape with an in-process approval capability",()=>{
  const value = approvedPayloadSchema.parse(payload());expect(isApprovedResponse(value)).toBe(false);
});
it.each([{ policyVersion: "old" },{ kind: "CLARIFICATION" },{ attemptVersion: 0 },{ markdown: "" },{ providerReasoning: "private" }])("rejects malformed or inconsistent storage fields",change=>{
  expect(approvedPayloadSchema.safeParse({ ...payload(),...change }).success).toBe(false);
});
it("rejects forged support status, duplicated sources and missing passage IDs",()=>{
  for (const change of [{ supportStatus: "FACT_CHECKED" },{ passageIds: [] },{ number: 3 }]) {
    const value = payload();expect(approvedPayloadSchema.safeParse({ ...value,sources: [{ ...value.sources[0],...change }] }).success).toBe(false);
  }
  const value = payload();expect(approvedPayloadSchema.safeParse({ ...value,sources: [value.sources[0],{ ...value.sources[0],number: 2 }] }).success).toBe(false);
});
it("canonicalizes storage keys without treating a digest as release permission",async()=>{
  const { serializeApprovedPayload } = await import("@/server/ai/approved-payload");
  const original = payload(),canonical = serializeApprovedPayload(original);
  const reversed = Object.fromEntries(Object.entries(original).reverse());
  expect(serializeApprovedPayload(reversed).payloadHash).toBe(canonical.payloadHash);
  expect(canonical.bodyHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(serializeApprovedPayload({ ...original,markdown: "Changed [S1]." }).bodyHash).not.toBe(canonical.bodyHash);
  expect(isApprovedResponse(canonical.payload)).toBe(false);
  expect(()=>serializeApprovedPayload({ ...original,policyVersion: "old" })).toThrow();
});
