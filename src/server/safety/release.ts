import {traceStage} from '@/server/telemetry/trace';
import { z } from "zod";
import { approvedPayloadSchema } from "@/server/contracts/answer";
import { questionTextSchema } from "@/server/contracts/chat";
import { evidencePackageSchema } from "@/server/contracts/pipeline";
import { validateCitations,type VisibleSource } from "@/server/ai/citations";
import { createInputGate } from "./input";
import type { SafetyProvider } from "./provider";
import { SAFETY_POLICY } from "./policy";
import { SAFETY_RESPONSES,resolveSafetyDecision,type SafetyResponse } from "./responses";
import type { ExecutionOptions } from "@/server/ai/bounded";
export const NO_EVIDENCE_TEXT = "I couldn’t find enough usable evidence to answer this question. Try a more specific question or check back later.";
const approvalInput = z.strictObject({ runId: z.uuid(),attemptVersion: z.int().positive(),revision: z.int().positive(),
  kind: z.enum(["ANSWER","CLARIFICATION","NO_EVIDENCE"]),question: questionTextSchema,markdown: questionTextSchema,evidence: evidencePackageSchema });
export type ApprovedResponse = Readonly<{ runId: string;attemptVersion: number;revision: number;policyVersion: "v1";
  kind: "ANSWER" | "CLARIFICATION" | "NO_EVIDENCE";markdown: string;sources: readonly Readonly<VisibleSource>[] }>;
export type ReleaseResult = { kind: "APPROVED";response: ApprovedResponse }
  | { kind: "DENIED";code: "OUTPUT_BLOCKED" | "SAFETY_UNAVAILABLE" | "DEADLINE_EXCEEDED";response: SafetyResponse };
const approved = new WeakSet<object>();
export function isApprovedResponse(value: unknown): value is ApprovedResponse { return typeof value === "object" && value !== null && approved.has(value); }
export function createReleaseGate(provider: SafetyProvider | undefined) {
  const gate = createInputGate(provider,"safety.output");
  return { async approve(value: unknown,options: ExecutionOptions): Promise<ReleaseResult> {
    const deny = (code: "OUTPUT_BLOCKED" | "SAFETY_UNAVAILABLE" | "DEADLINE_EXCEEDED",response: SafetyResponse = SAFETY_RESPONSES.UNAVAILABLE): ReleaseResult=>({ kind: "DENIED",code,response });
    try {
      const parsed = approvalInput.safeParse(value);
      if (!parsed.success) return deny("OUTPUT_BLOCKED");
      const input = parsed.data;
      if (input.evidence.runId !== input.runId || (input.kind !== "ANSWER" && input.evidence.sources.length) ||
        (input.kind === "NO_EVIDENCE" && input.markdown !== NO_EVIDENCE_TEXT) || (input.kind === "CLARIFICATION" && input.markdown.length > 800)) return deny("OUTPUT_BLOCKED");
      const sources = await traceStage("citations",async()=>validateCitations(input.markdown,input.evidence,input.kind === "ANSWER"));
      const verdict = await gate.evaluate({ text: input.markdown,context: [
        { role: "USER",text: JSON.stringify({ originalQuestion: input.question }) },
        ...sources.map(source=>({ role: "ASSISTANT",text: JSON.stringify(source) })),
      ] },options);
      const decision = resolveSafetyDecision(verdict.verdict);
      if (decision.decision !== "ALLOW") return deny(decision.decision === "BLOCK" ? "OUTPUT_BLOCKED" : verdict.reason === "TIMEOUT" ? "DEADLINE_EXCEEDED" : "SAFETY_UNAVAILABLE",decision.response);
      if (options.signal.aborted || Date.now() >= options.deadlineAt.getTime()) return deny("SAFETY_UNAVAILABLE");
      for (const source of sources) { Object.freeze(source.passageIds);Object.freeze(source.contentHashes);Object.freeze(source); }
      const candidate = { runId: input.runId,attemptVersion: input.attemptVersion,revision: input.revision,
        policyVersion: SAFETY_POLICY.version,kind: input.kind,markdown: input.markdown,sources: Object.freeze(sources) };
      if (!approvedPayloadSchema.safeParse(candidate).success) return deny("OUTPUT_BLOCKED");
      const response: ApprovedResponse = Object.freeze(candidate);
      approved.add(response); return { kind: "APPROVED",response };
    } catch { return deny("SAFETY_UNAVAILABLE"); }
  } };
}
