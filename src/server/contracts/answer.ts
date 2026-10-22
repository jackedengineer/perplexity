import { z } from "zod";
import { questionTextSchema } from "./chat";
import { sourceIdSchema,sourceUrlSchema } from "./pipeline";
import { SAFETY_POLICY } from "@/server/safety/policy";
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const answerKindSchema = z.enum(["ANSWER","CLARIFICATION","NO_EVIDENCE"]);
export const visibleSourceSchema = z.strictObject({
  sourceId: sourceIdSchema,
  number: z.int().min(1).max(5),
  url: sourceUrlSchema,
  title: z.string().min(1).max(300),
  publishedAt: z.iso.datetime().nullable(),
  passageIds: z.array(z.uuid()).length(1),
  contentHashes: z.array(hash).length(1),
  supportStatus: z.literal("NOT_CHECKED"),
});
// Shape validation for storage/reload; this schema is NOT a release authorization.
export const approvedPayloadSchema = z.strictObject({
  runId: z.uuid(),
  attemptVersion: z.int().positive(),
  revision: z.int().positive(),
  policyVersion: z.literal(SAFETY_POLICY.version),
  kind: answerKindSchema,
  markdown: questionTextSchema,
  sources: z.array(visibleSourceSchema).max(5),
}).superRefine((value,context)=>{
  const ids = value.sources.map(s=>s.sourceId);
  if (new Set(ids).size !== ids.length || value.sources.some((s,i)=>s.number !== i+1) ||
      (value.kind === "ANSWER" ? ids.length === 0 : ids.length > 0) ||
      (value.kind === "CLARIFICATION" && value.markdown.length > 800)) {
    context.addIssue({ code: "custom",message: "Inconsistent approved payload" });
  }
});
export type ApprovedPayload = z.infer<typeof approvedPayloadSchema>;
