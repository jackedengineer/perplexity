import * as z from "zod/mini";
import type { UIMessage } from "ai";
import { publicAnswerView } from "@/server/answers/view";
export const committedAnswerView = z.strictObject({
  runId: z.uuid(),conversationId: z.uuid(),revision: z.int().check(z.nonnegative()),messageId: z.uuid(),
  text: z.string().check(z.maxLength(4000)),answer: publicAnswerView,createdAt: z.iso.datetime(),
});
export type CommittedAnswer = z.infer<typeof committedAnswerView>;
export const runStateView = z.strictObject({
  runId: z.uuid(),conversationId: z.uuid(),revision: z.int().check(z.nonnegative()),
  state: z.enum(["NEEDS_CLARIFICATION","PLANNING","CHECKING_REQUEST","SEARCHING","PREPARING_ANSWER","CHECKING_ANSWER","COMPLETED","UNAVAILABLE"]),
  answer: z.optional(committedAnswerView),
  terminalReason: z.optional(z.enum(["CANCELLED","TIMED_OUT"])),
});
export type RunState = z.infer<typeof runStateView>;
export type ResearchMessage = UIMessage<unknown,{
  run: { runId: string;revision: number };
  stage: { runId: string;stage: "PLANNING" | "SEARCHING" | "PREPARING_ANSWER" | "CHECKING_ANSWER" | "SAVING_ANSWER" };
  answer: CommittedAnswer;
}>;
