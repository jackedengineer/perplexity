import { z } from "zod";
import { questionTextSchema } from "@/server/contracts/chat";

export const INPUT_DETECTOR_VERSION = "input-v1";
export const INPUT_REASONS = ["DETERMINISTIC_SECRET", "DETERMINISTIC_ABUSE", "CLASSIFIER", "INVALID_INPUT",
  "CONFIGURATION_UNAVAILABLE", "PROVIDER_UNAVAILABLE", "MALFORMED_OUTPUT", "CLASSIFIER_UNAVAILABLE", "TIMEOUT", "CANCELLED"] as const;
export type InputReason = typeof INPUT_REASONS[number];
export const safetyInputSchema = z.strictObject({
  text: questionTextSchema,
  context: z.array(z.strictObject({ role: z.enum(["USER", "ASSISTANT"]), text: questionTextSchema })).max(6),
}).refine(({ context })=>context.reduce((sum,turn)=>sum+turn.text.length,0) <= 8000);
export type SafetyInput = z.infer<typeof safetyInputSchema>;
import type { ProviderUsage } from "@/server/ai/usage";
export interface SafetyProvider {
  usage?(): ProviderUsage | undefined;
  readonly modelId: string;
  classify(input: SafetyInput, signal: AbortSignal): Promise<unknown>;
}
export class SafetyProviderError extends Error {
  constructor(readonly reason: "PROVIDER_UNAVAILABLE" | "MALFORMED_OUTPUT") {
    super("Safety classifier unavailable.");
  }
}
