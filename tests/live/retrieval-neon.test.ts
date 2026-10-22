import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createMessageAcceptance } from "@/server/runs/accept-message";
import { createInputGate } from "@/server/safety/input";
import { createEvidenceGate } from "@/server/safety/evidence";
import { createRetrieval } from "@/server/search/retrieve";
import { hashPassage } from "@/server/search/evidence";
import { createNeonFixture, simultaneously } from "./admission-fixture";
const f = createNeonFixture();
const allow = { decision: "ALLOW",categoryCodes: [],policyVersion: "v1" };
const provider = () => ({ modelId: "test/safety",classify: vi.fn().mockResolvedValue(allow) });
const signal = () => new AbortController().signal;
afterEach(()=>f.cleanup()); afterAll(()=>f.close());
async function fixture() {
  const person = await f.identity(); await f.budgets();
  person.request.message.text = "Why do rainbows form?";
  const admitted = await f.admission.admit(person.subject,person.request);
  if (admitted.kind !== "ADMITTED") throw new Error("Synthetic admission failed");
  const acceptance = createMessageAcceptance(f.runtime,f.keys,createInputGate(provider()));
  expect((await acceptance.accept(person.subject,admitted.run.id,person.request,signal())).kind).toBe("ACCEPTED");
  return { ...person,runId: admitted.run.id };
}
function pipeline() {
  const query = provider(),evidence = provider();
  const search = { search: vi.fn().mockResolvedValue({ results: [{ title: "Synthetic rainbow evidence",url: "https://example.org/rainbows",content: "Water refracts sunlight.",score: 0.8 }],credits: 1 }) };
  const service = createRetrieval(f.runtime,{ modelId: "test/safety",search,queryGate: createInputGate(query),evidenceGate: createEvidenceGate(evidence) });
  return { query,evidence,search,service };
}
it("stores reviewed same-run passages through the restricted RLS runtime role",async()=>{
  const person = await fixture(),p = pipeline();
  expect(await p.service.retrieve(person.subject,person.runId,signal())).toMatchObject({ kind: "READY",sources: 1 });
  const package_ = await p.service.load(person.subject,person.runId);
  expect(package_?.passages).toHaveLength(1); expect(package_?.passages[0].contentHash).toBe(hashPassage("Water refracts sunlight."));
  const [record] = await f.owner.select().from(schema.runRetrievals).where(eq(schema.runRetrievals.runId,person.runId));
  expect(record).toMatchObject({ status: "READY",queryVerdict: "ALLOW",evidenceVerdict: "ALLOW",searchCredits: 1 });
  const [source] = await f.owner.select().from(schema.runSources).where(eq(schema.runSources.runId,person.runId));
  const [passage] = await f.owner.select().from(schema.sourcePassages).where(eq(schema.sourcePassages.runId,person.runId));
  expect(passage.sourceId).toBe(source.id); expect(package_?.sources[0].sourceId).toBe(source.sourceKey);
  expect(await p.service.load("foreign-subject",person.runId)).toBeNull();
});
it("four concurrent retrieval claims execute exactly one search and evidence check",async()=>{
  const person = await fixture(),p = pipeline();
  const results = await simultaneously(Array.from({ length: 4 },()=>()=>p.service.retrieve(person.subject,person.runId,signal())));
  expect(results.filter(r=>r.kind === "READY")).toHaveLength(1);
  expect(results.filter(r=>r.kind === "RUN_IN_PROGRESS")).toHaveLength(3);
  expect(p.search.search).toHaveBeenCalledOnce(); expect(p.query.classify).toHaveBeenCalledOnce(); expect(p.evidence.classify).toHaveBeenCalledOnce();
  expect(await f.owner.select().from(schema.sourcePassages).where(eq(schema.sourcePassages.runId,person.runId))).toHaveLength(1);
});
it("outbound-query denial prevents all search calls, retaining only decision metadata",async()=>{
  const person = await fixture(),p = pipeline();
  p.query.classify.mockResolvedValue({ decision: "BLOCK",categoryCodes: ["FRAUD"],policyVersion: "v1" });
  expect(await p.service.retrieve(person.subject,person.runId,signal())).toEqual({ kind: "DENIED",code: "INPUT_BLOCKED" });
  expect(p.search.search).not.toHaveBeenCalled(); expect(p.evidence.classify).not.toHaveBeenCalled();
  const records = await f.owner.select().from(schema.runRetrievals).where(eq(schema.runRetrievals.runId,person.runId));
  expect(JSON.stringify(records)).not.toContain(person.request.message.text); expect(records[0].searchCredits).toBeNull();
});
it("evidence rejection persists no raw titles, URLs or passages",async()=>{
  const person = await fixture(),p = pipeline();
  p.evidence.classify.mockResolvedValue({ decision: "BLOCK",categoryCodes: ["PROMPT_INJECTION"],policyVersion: "v1" });
  const result = await p.service.retrieve(person.subject,person.runId,signal()); expect(result).toEqual({ kind: "DENIED",code: "OUTPUT_BLOCKED" });
  expect(await f.owner.select().from(schema.runSources).where(eq(schema.runSources.runId,person.runId))).toHaveLength(0);
  expect(await f.owner.select().from(schema.sourcePassages).where(eq(schema.sourcePassages.runId,person.runId))).toHaveLength(0);
  const [record] = await f.owner.select().from(schema.runRetrievals).where(eq(schema.runRetrievals.runId,person.runId));
  expect(record).toMatchObject({ status: "BLOCKED",searchCredits: 1 }); expect(JSON.stringify([result,record])).not.toMatch(/example.org|Water refracts/);
});
it("runtime cannot insert unreviewed evidence or mutate/delete stored excerpts",async()=>{
  const person = await fixture(),p = pipeline();
  await expect(f.runtime.insert(schema.runSources).values({ runId: person.runId,sourceKey: "S1",url: "https://example.org",title: "Synthetic",rank: 1,retrievedAt: new Date() })).rejects.toMatchObject({ cause: { code: "42501" } });
  expect((await p.service.retrieve(person.subject,person.runId,signal())).kind).toBe("READY");
  await expect(f.runtime.update(schema.sourcePassages).set({ text: "unauthorized mutation" }).where(eq(schema.sourcePassages.runId,person.runId))).rejects.toMatchObject({ cause: { code: "42501" } });
  await expect(f.runtime.delete(schema.runSources).where(eq(schema.runSources.runId,person.runId))).rejects.toMatchObject({ cause: { code: "42501" } });
  await expect(f.runtime.update(schema.runRetrievals).set({ expiresAt: new Date() }).where(eq(schema.runRetrievals.runId,person.runId))).rejects.toMatchObject({ cause: { code: "42501" } });
});
it("a fencing change during evidence checking prevents a late ALLOW commit",async()=>{
  const person = await fixture(),p = pipeline();
  p.evidence.classify.mockImplementation(async()=>{
    await f.owner.update(schema.runs).set({ attemptVersion: 2 }).where(eq(schema.runs.id,person.runId)); return allow;
  });
  expect(await p.service.retrieve(person.subject,person.runId,signal())).toEqual({ kind: "DENIED",code: "CONFLICT" });
  expect(await f.owner.select().from(schema.sourcePassages).where(eq(schema.sourcePassages.runId,person.runId))).toHaveLength(0);
  const [reservation] = await f.owner.select().from(schema.usageReservations).where(eq(schema.usageReservations.runId,person.runId));
  expect(reservation.providerReserveMicroUsd).toBe(50000n);
});
it("database rejects cross-run passage links with a valid hash",async()=>{
  const person = await fixture(),p = pipeline();
  expect((await p.service.retrieve(person.subject,person.runId,signal())).kind).toBe("READY");
  const [source] = await f.owner.select().from(schema.runSources).where(eq(schema.runSources.runId,person.runId));
  const [passage] = await f.owner.select().from(schema.sourcePassages).where(eq(schema.sourcePassages.runId,person.runId));
  await f.owner.delete(schema.sourcePassages).where(eq(schema.sourcePassages.id,passage.id));
  await expect(f.owner.insert(schema.sourcePassages).values({ id: randomUUID(),runId: randomUUID(),sourceId: source.id,text: "Synthetic",contentHash: hashPassage("Synthetic"),contentKind: "SEARCH_PASSAGE" })).rejects.toMatchObject({ cause: { code: "23503" } });
});
