import { z } from "zod";
import { questionTextSchema } from "@/server/contracts/chat";

export const INPUT_DETECTOR_VERSION = "input-v1";
export const INPUT_REASONS = ["DETERMINISTIC_SECRET", "DETERMINISTIC_ABUSE", "CLASSIFIER", "INVALID_INPUT",
  "CONFIGURATION_UNAVAILABLE", "PROVIDER_UNAVAILABLE", "MALFORMED_OUTPUT", "CLASSIFIER_UNAVAILABLE", "TIMEOUT", "CANCELLED"] as const;
export type InputReason = typeof INPUT_REASONS[number];
export const safetyInputSchema = z.strictObject({
  text: questionTextSchema,
  // Server-owned JSON metadata can wrap a full original question. Its framing
  // allowance does not change public submission limits or the total wire cap.
  context: z.array(z.strictObject({ role: z.enum(["USER", "ASSISTANT"]), text: z.string().max(4096)
    .refine(value=>value.trim().length>0&&value.isWellFormed()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) })).max(6),
}).refine(({ context })=>context.reduce((sum,turn)=>sum+turn.text.length,0) <= 8512);
export type SafetyInput = z.infer<typeof safetyInputSchema>;
import type { ProviderUsage } from "@/server/ai/usage";
export interface SafetyProvider {
  usage?(): ProviderUsage | undefined;
  readonly modelId: string;
  classify(input: SafetyInput, signal: AbortSignal): Promise<unknown>;
}
export class SafetyProviderError extends Error {
  constructor(readonly reason: "PROVIDER_UNAVAILABLE" | "MALFORMED_OUTPUT" | "TIMEOUT") {
    super("Safety classifier unavailable.");
  }
}
