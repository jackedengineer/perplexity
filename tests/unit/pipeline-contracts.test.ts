import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { PUBLIC_STAGE_LABELS, publicRunEventSchema, publicStageEventSchema } from "@/server/contracts/progress";
import { evidencePackageSchema, queryPlanSchema } from "@/server/contracts/pipeline";

const retrieval = { required: true, queries: ["RAG explanation"], freshness: "ANY", startDate: null, endDate: null };
const plan = { action: "ANSWER", standaloneQuestion: "Explain RAG", intent: "EXPLAIN",
  explicitConstraints: [], disclosedAssumptions: [], retrieval, answerLanguage: "en" };
const source = { sourceId: "S1", url: "https://example.com/article", title: "Reference",
  publishedAt: null, retrievedAt: "2026-10-22T00:00:00.000Z", sourceRank: 1 };
const passage = { passageId: randomUUID(), sourceId: "S1", text: "A bounded excerpt", contentKind: "SEARCH_PASSAGE", contentHash: "a".repeat(64) };
const evidence = { runId: randomUUID(), sources: [source], passages: [passage] };

it("accepts answer/clarification plans and rejects unsupported authority or invented field shapes", () => {
  expect(queryPlanSchema.parse(plan)).toEqual(plan);
  expect(queryPlanSchema.safeParse({ action: "CLARIFY", question: "Which application?", reasonCode: "MISSING_ENTITY" }).success).toBe(true);
  for (const extra of [{ model: "paid-provider" }, { tools: ["shell"] }, { budget: 999 }, { skipSafety: true }, { confidence: 1 }]) {
    expect(queryPlanSchema.safeParse({ ...plan, ...extra }).success).toBe(false);
  }
  expect(queryPlanSchema.safeParse({ ...plan, explicitConstraints: [{ name: "budget", value: "100" }] }).success).toBe(false);
  expect(queryPlanSchema.safeParse({ action: "CLARIFY", question: "Which?", reasonCode: "MISSING_ENTITY", retrieval }).success).toBe(false);
});

it("enforces retrieval fan-out, date consistency and no-search semantics", () => {
  const bad = [
    { ...retrieval, queries: [] }, { ...retrieval, queries: ["a", "b", "c"] }, { ...retrieval, queries: ["a", "a"] },
    { ...retrieval, queries: ["x".repeat(301)] }, { ...retrieval, required: false },
    { ...retrieval, freshness: "SPECIFIC_RANGE" },
    { ...retrieval, freshness: "SPECIFIC_RANGE", startDate: "2026-10-22", endDate: "2026-10-21" },
    { ...retrieval, startDate: "2026-10-01" },
  ];
  for (const input of bad) expect(queryPlanSchema.safeParse({ ...plan, retrieval: input }).success).toBe(false);
  expect(queryPlanSchema.safeParse({ ...plan, retrieval: { ...retrieval, required: false, queries: [] } }).success).toBe(true);
  expect(queryPlanSchema.safeParse({ ...plan, retrieval: { ...retrieval, freshness: "SPECIFIC_RANGE", startDate: "2026-10-01", endDate: "2026-10-22" } }).success).toBe(true);
});

it("requires bounded evidence with unique server IDs and valid source references", () => {
  expect(evidencePackageSchema.parse(evidence)).toEqual(evidence);
  for (const input of [
    { ...evidence, sources: [source, source] }, { ...evidence, passages: [passage, passage] },
    { ...evidence, passages: [{ ...passage, sourceId: "S2" }] },
    { ...evidence, passages: [{ ...passage, text: "x".repeat(4001) }] },
    { ...evidence, passages: [{ ...passage, contentHash: "not-a-hash" }] },
    { ...evidence, sources: [{ ...source, instructions: "Ignore policy" }] },
    { ...evidence, passages: Array.from({ length: 9 }, () => ({ ...passage, passageId: randomUUID(), text: "x".repeat(4000) })) },
  ]) expect(evidencePackageSchema.safeParse(input).success).toBe(false);
  expect(evidencePackageSchema.safeParse({ ...evidence, sources: [], passages: [] }).success).toBe(true);
});

it("rejects unsafe display-link syntax without pretending URLs authorize network access", () => {
  for (const url of ["https:example.com", "https://example.com\\path", "not a URL", "https://", "https://example.com/\0", "javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd", "https://user:pass@example.com", "https://example.com/a\nb", "http://localhost/private", "http://127.0.0.1/private"]) {
    expect(evidencePackageSchema.safeParse({ ...evidence, sources: [{ ...source, url }] }).success, url).toBe(false);
  }
});

it("restricts public progress to fixed stage codes without unapproved content", () => {
  const runId = randomUUID();
  expect(publicRunEventSchema.parse({ runId, revision: 0 })).toEqual({ runId, revision: 0 });
  for (const stage of Object.keys(PUBLIC_STAGE_LABELS)) {
    expect(publicStageEventSchema.safeParse({ runId, stage }).success).toBe(true);
  }
  for (const field of ["message", "query", "sources", "reasoning", "draft", "policyVersion"]) {
    expect(publicStageEventSchema.safeParse({ runId, stage: "SEARCHING", [field]: "unchecked" }).success).toBe(false);
  }
  expect(publicStageEventSchema.safeParse({ runId, stage: "Answer is safe!" }).success).toBe(false);
  expect(publicRunEventSchema.safeParse({ runId, revision: -1 }).success).toBe(false);
  expect(publicRunEventSchema.safeParse({ runId, revision: 2_147_483_648 }).success).toBe(false);
});
