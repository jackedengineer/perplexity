import { z } from "zod";

// Domain payloads only; T11 will bind them to the installed AI SDK stream protocol.
// Emit only after input approval. No provider prose or raw evidence belongs here.
export const publicStageSchema = z.enum(["PLANNING","SEARCHING", "PREPARING_ANSWER", "CHECKING_ANSWER", "SAVING_ANSWER"]);
export type PublicStage = z.infer<typeof publicStageSchema>;
export const PUBLIC_STAGE_LABELS = Object.freeze({
  PLANNING: "Understanding your question", SEARCHING: "Searching the web", PREPARING_ANSWER: "Preparing an answer",
  CHECKING_ANSWER: "Checking the answer", SAVING_ANSWER: "Saving the answer",
} satisfies Record<PublicStage, string>);
export const publicRunEventSchema = z.strictObject({ runId: z.uuid(), revision: z.int().min(0).max(2_147_483_647) });
export const publicStageEventSchema = z.strictObject({ runId: z.uuid(), stage: publicStageSchema });
export type PublicRunEvent = z.infer<typeof publicRunEventSchema>;
export type PublicStageEvent = z.infer<typeof publicStageEventSchema>;
