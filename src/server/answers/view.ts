import * as z from "zod/mini";
// Browser-safe presentation data. Private excerpts, hashes and model fields never cross this boundary.
export type AnswerNode = { type: "paragraph" | "heading" | "text" | "strong" | "emphasis" | "blockquote" | "list" | "listItem" | "code" | "inlineCode" | "break" | "thematicBreak" | "citation";text?: string;depth?: number;ordered?: boolean;start?: number;number?: number;children?: AnswerNode[] };
const node: z.ZodMiniType<AnswerNode> = z.lazy(()=>z.strictObject({
  type: z.enum(["paragraph","heading","text","strong","emphasis","blockquote","list","listItem","code","inlineCode","break","thematicBreak","citation"]),
  text: z.optional(z.string().check(z.maxLength(4000))),depth: z.optional(z.int().check(z.minimum(1),z.maximum(6))),
  ordered: z.optional(z.boolean()),start: z.optional(z.int().check(z.minimum(0),z.maximum(999999999))),number: z.optional(z.int().check(z.minimum(1),z.maximum(5))),
  children: z.optional(z.array(node).check(z.maxLength(2000))),
}));
export const publicAnswerView = z.strictObject({
  kind: z.enum(["ANSWER","NO_EVIDENCE","CLARIFICATION"]),
  document: z.array(node).check(z.maxLength(2000)),
  sources: z.array(z.strictObject({ sourceId: z.string().check(z.regex(/^S[1-5]$/u)),number: z.int().check(z.minimum(1),z.maximum(5)),
    url: z.string().check(z.maxLength(2048),z.regex(/^https?:\/\//u)),title: z.string().check(z.maxLength(300)),domain: z.string().check(z.maxLength(253)),supportStatus: z.literal("NOT_CHECKED") })).check(z.maxLength(5)),
});
export type PublicAnswer = z.infer<typeof publicAnswerView>;
