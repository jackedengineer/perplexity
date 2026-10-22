import { z } from "zod";
import { localeSchema, questionTextSchema } from "./chat";

export const FAST_CONTRACT_LIMITS = Object.freeze({
  searchQueries: 2, queryCharacters: 300, constraints: 16, assumptions: 4,
  sources: 10, passages: 20, passageCharacters: 4_000, evidenceCharacters: 32_000,
});
const line = (max: number) => z.string().min(1).max(max)
  .refine((value) => value.trim().length > 0 && value.isWellFormed() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value));
const retrievalSchema = z.strictObject({
  required: z.boolean(), queries: z.array(line(FAST_CONTRACT_LIMITS.queryCharacters)).max(FAST_CONTRACT_LIMITS.searchQueries),
  freshness: z.enum(["ANY", "RECENT", "SPECIFIC_RANGE"]),
  startDate: z.iso.date().nullable(), endDate: z.iso.date().nullable(),
}).superRefine((value, context) => {
  const datesValid = value.freshness === "SPECIFIC_RANGE"
    ? value.startDate !== null && value.endDate !== null && value.startDate <= value.endDate
    : value.startDate === null && value.endDate === null;
  const queries = value.queries.map((query) => query.trim().toLowerCase());
  if (!datesValid || new Set(queries).size !== queries.length ||
      (value.required ? queries.length === 0 : queries.length !== 0 || value.freshness !== "ANY")) {
    context.addIssue({ code: "custom", message: "Inconsistent retrieval plan" });
  }
});
export const queryPlanSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("CLARIFY"), question: questionTextSchema.pipe(z.string().max(800)),
    reasonCode: z.enum(["MISSING_ENTITY", "MISSING_CONSTRAINT", "AMBIGUOUS_REFERENCE"]) }),
  z.strictObject({ action: z.literal("ANSWER"), standaloneQuestion: questionTextSchema,
    intent: z.enum(["EXPLAIN", "FACT", "COMPARE", "RECOMMEND", "RESEARCH"]),
    explicitConstraints: z.array(z.strictObject({ name: line(64), value: line(512), sourceMessageId: z.uuid() })).max(FAST_CONTRACT_LIMITS.constraints),
    disclosedAssumptions: z.array(line(256)).max(FAST_CONTRACT_LIMITS.assumptions),
    retrieval: retrievalSchema, answerLanguage: localeSchema }),
]);

// Display syntax only. This schema never authorizes fetching a URL (T07/T09).
export const sourceUrlSchema = z.string().max(2_048).regex(/^https?:\/\//iu)
  .refine((value) => !/[\s\\\u0000-\u001f\u007f]/u.test(value))
  .pipe(z.httpUrl()).refine((value) => {
  try { const url = new URL(value); return !url.username && !url.password; } catch { return false; }
});
export const sourceIdSchema = z.string().regex(/^S(?:[1-9]|10)$/u);
const sourceSchema = z.strictObject({
  sourceId: sourceIdSchema, url: sourceUrlSchema, title: line(300),
  publishedAt: z.iso.datetime().nullable(), retrievedAt: z.iso.datetime(),
  sourceRank: z.int().min(1).max(FAST_CONTRACT_LIMITS.sources),
});
const passageSchema = z.strictObject({
  passageId: z.uuid(), sourceId: sourceIdSchema, text: questionTextSchema,
  contentKind: z.enum(["SEARCH_PASSAGE", "EXTRACTED_PAGE"]), contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
});
export const evidencePackageSchema = z.strictObject({
  runId: z.uuid(), sources: z.array(sourceSchema).max(FAST_CONTRACT_LIMITS.sources),
  passages: z.array(passageSchema).max(FAST_CONTRACT_LIMITS.passages),
}).superRefine((value, context) => {
  const sourceIds = new Set(value.sources.map((source) => source.sourceId));
  const passageIds = new Set(value.passages.map((passage) => passage.passageId));
  if (sourceIds.size !== value.sources.length || passageIds.size !== value.passages.length ||
      value.passages.some((passage) => !sourceIds.has(passage.sourceId)) ||
      value.passages.reduce((total, passage) => total + [...passage.text].length, 0) > FAST_CONTRACT_LIMITS.evidenceCharacters) {
    context.addIssue({ code: "custom", message: "Invalid evidence references or size" });
  }
});
export type QueryPlan = z.infer<typeof queryPlanSchema>;
export type EvidencePackage = z.infer<typeof evidencePackageSchema>;
