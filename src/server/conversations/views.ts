import * as z from "zod/mini";
import { publicAnswerView } from "@/server/answers/view";

// Public response schemas are shared with the browser; keep server input transforms out of its bundle.
export const conversationView = z.strictObject({
  id: z.uuid(), title: z.string(), revision: z.int(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export type Conversation = z.infer<typeof conversationView>;
export const historyPageView = z.object({
  items: z.array(z.strictObject({
    id: z.uuid(), role: z.enum(["USER", "ASSISTANT"]), kind: z.enum(["QUESTION", "ANSWER", "CLARIFICATION"]),
    parts: z.array(z.strictObject({ type: z.literal("text"), text: z.string().check(z.maxLength(100_000)) })).check(z.maxLength(128)),
    answer: z.optional(publicAnswerView),
    sequence: z.int().check(z.positive()), schemaVersion: z.literal(1), createdAt: z.iso.datetime(),
  })).check(z.maxLength(50)),
  nextBefore: z.nullable(z.int().check(z.positive())),
});
export type HistoryPage = z.infer<typeof historyPageView>;
