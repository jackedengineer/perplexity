import { z } from "zod";

const title = z.string().trim().transform((value) => value.replace(/\s+/gu, " "))
  .pipe(z.string().min(1).max(160).refine((value) => !/[\u0000-\u001f\u007f]/u.test(value)));
export const createInput = z.strictObject({ clientRequestId: z.uuid(), title: title.default("Untitled") });
export const renameInput = z.strictObject({ title, expectedRevision: z.number().int().min(0).max(2_147_483_646) });
const cursorShape = z.strictObject({ updatedAt: z.iso.datetime(), id: z.uuid() });
const cursor = z.string().max(512).regex(/^[A-Za-z0-9_-]+$/u).transform((value, ctx) => {
  try { return cursorShape.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); }
  catch { ctx.addIssue({ code: "custom", message: "Invalid cursor" }); return z.NEVER; }
});
export function encodeCursor(value: z.infer<typeof cursorShape>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
const limit = z.coerce.number().int().min(1).max(50).default(20);
export const listInput = z.strictObject({
  cursor: cursor.optional(), limit,
  q: z.string().trim().max(160).refine((value) => !/[\u0000-\u001f\u007f]/u.test(value)).default(""),
});
export const historyInput = z.strictObject({ before: z.coerce.number().int().positive().optional(), limit });
export const conversationId = z.uuid();

export { conversationView, historyPageView } from "./views";
export type { Conversation, HistoryPage } from "./views";
export type ConversationList = { items: import("./views").Conversation[]; nextCursor: string | null };
export type CreateInput = z.infer<typeof createInput>;
export type ListInput = z.infer<typeof listInput>;
export type HistoryInput = z.infer<typeof historyInput>;
