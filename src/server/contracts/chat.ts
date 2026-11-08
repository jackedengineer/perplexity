import { z } from "zod";

// FAST is the Web mode. DOCUMENTS answers only from the signed-in user's own files: the
// browser sends CHAT with attached files, and admission records the run as DOCUMENTS.
export const RUN_MODES = ["FAST","CHAT","DOCUMENTS"] as const;
// Files attached to one question. Order is kept so the composer and history show them as sent.
export const MAX_ATTACHED_DOCUMENTS = 5;
export type RunMode = typeof RUN_MODES[number];
export const CONTRACT_VERSION = 1;
export const MAX_SUBMISSION_BYTES = 16_384; // Enforce while reading HTTP bytes, before JSON parsing (T05).
export const MAX_QUESTION_CHARACTERS = 4_000;
export const FAST_MODEL_KEY = "fast-default";

// Preserve the user's text. Normalized inspection copies belong to the safety gate.
export const questionTextSchema = z.string().max(MAX_QUESTION_CHARACTERS)
  .refine((value) => value.trim().length > 0 && value.isWellFormed())
  .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value));
export const localeSchema = z.string().min(2).max(64).refine((value) => {
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
});
export const timezoneSchema = z.string().min(1).max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/u).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  });
export const submissionSchema = z.strictObject({
  conversationId: z.uuid(), clientRequestId: z.uuid(),
  expectedRevision: z.int().min(0).max(2_147_483_646),
  message: z.strictObject({ text: questionTextSchema }),
  mode: z.enum(RUN_MODES), modelKey: z.enum([FAST_MODEL_KEY,"economy-nano","economy-mistral","economy-qwen","economy-gemini","standard-deepseek","standard-gemini-flash","standard-qwen-max","standard-qwen-397b"]),
  locale: localeSchema.optional(), timezone: timezoneSchema.optional(),
  documentIds: z.array(z.uuid()).min(1).max(MAX_ATTACHED_DOCUMENTS)
    .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length).optional(),
});
export type SubmitQuery = z.infer<typeof submissionSchema>;
