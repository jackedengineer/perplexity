import { questionTextSchema } from "@/server/contracts/chat";
import { validateEvidence } from "@/server/search/evidence";
import { inspectInput } from "@/server/safety/deterministic";
import { NO_EVIDENCE_TEXT } from "@/server/safety/release";
import { AnswerError,type ExecutionOptions } from "@/server/ai/bounded";
import type { AnswerProvider,DraftInput,PrivateDraft } from "@/server/ai/answer";
export type DraftResponse = PrivateDraft & { kind: "ANSWER" | "NO_EVIDENCE" };
// Private memory only: this value must pass release approval and atomic persistence.
export async function generatePrivateDraft(input: DraftInput,provider: AnswerProvider | undefined,options: ExecutionOptions): Promise<DraftResponse> {
  const question = questionTextSchema.safeParse(input.question),evidence = validateEvidence(input.evidence);
  if (!question.success || !evidence || options.signal.aborted || Date.now() >= options.deadlineAt.getTime() ||
    inspectInput({ text: question.data,context: [] })) throw new AnswerError();
  if (evidence.sources.length === 0) return { kind: "NO_EVIDENCE",text: NO_EVIDENCE_TEXT,
    usage: { costMicroUsd: 0n,inputTokens: 0,outputTokens: 0,actualModel: null } };
  if (!provider) throw new AnswerError();
  try {
    const draft = await provider.generate({ question: question.data,evidence },options);
    if (options.signal.aborted || Date.now() >= options.deadlineAt.getTime() || !questionTextSchema.safeParse(draft.text).success) throw new AnswerError();
    return { kind: "ANSWER",text: draft.text,usage: draft.usage };
  } catch { throw new AnswerError(); }
}
