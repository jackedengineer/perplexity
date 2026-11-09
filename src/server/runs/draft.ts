import { localeSchema,questionTextSchema } from "@/server/contracts/chat";
import { validateEvidence } from "@/server/search/evidence";
import { inspectInput } from "@/server/safety/deterministic";
import { NO_EVIDENCE_TEXT } from "@/server/safety/release";
import { AnswerError,ProviderRefusalError,type ExecutionOptions } from "@/server/ai/bounded";
import type { AnswerProvider,DraftInput,PrivateDraft } from "@/server/ai/answer";
export type DraftResponse = PrivateDraft & { kind: "ANSWER" | "NO_EVIDENCE" | "CHAT" };
// Private memory only: this value must pass release approval and atomic persistence.
export async function generatePrivateDraft(input: DraftInput,provider: AnswerProvider | undefined,options: ExecutionOptions,mode: "FAST" | "CHAT" = "FAST"): Promise<DraftResponse> {
  const question = questionTextSchema.safeParse(input.question),evidence = validateEvidence(input.evidence);
  if (!question.success || !evidence || options.signal.aborted || Date.now() >= options.deadlineAt.getTime() ||
    inspectInput({ text: question.data,context: [] })) throw new AnswerError();
  if (mode === "CHAT" && (evidence.sources.length || evidence.passages.length)) throw new AnswerError();
  if (mode !== "CHAT" && evidence.sources.length === 0) return { kind: "NO_EVIDENCE",text: NO_EVIDENCE_TEXT,
    usage: { costMicroUsd: 0n,inputTokens: 0,outputTokens: 0,actualModel: null } };
  if (!provider) throw new AnswerError();
  try {
    const draft = await provider.generate({ question: question.data,evidence,...(mode === "CHAT" ? {context:input.context}:{}),answerLanguage:localeSchema.parse(input.answerLanguage??'en'),...(input.interpretation?{interpretation:questionTextSchema.parse(input.interpretation)}:{}),...(input.reader?{reader:input.reader}:{}) },options);
    if (options.signal.aborted || Date.now() >= options.deadlineAt.getTime() || !questionTextSchema.safeParse(draft.text).success) throw new AnswerError();
    return { kind: mode === "CHAT" ? "CHAT" : "ANSWER",text: draft.text,usage: draft.usage };
  } catch(error) { if(error instanceof ProviderRefusalError)throw error;throw new AnswerError(); }
}
