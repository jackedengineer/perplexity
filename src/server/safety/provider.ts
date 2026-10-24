import { z } from "zod";
import { questionTextSchema } from "@/server/contracts/chat";

export const INPUT_DETECTOR_VERSION = "input-v1";
export const INPUT_REASONS = ["DETERMINISTIC_SECRET", "DETERMINISTIC_ABUSE", "CLASSIFIER", "INVALID_INPUT",
  "CONFIGURATION_UNAVAILABLE", "PROVIDER_UNAVAILABLE", "MALFORMED_OUTPUT", "CLASSIFIER_UNAVAILABLE", "TIMEOUT", "CANCELLED"] as const;
export type InputReason = typeof INPUT_REASONS[number];
const contextText=(max:number)=>z.string().max(max)
  .refine(value=>value.trim().length>0&&value.isWellFormed()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value));
const context=(max:number)=>z.array(z.strictObject({role:z.enum(["USER","ASSISTANT"]),text:contextText(max)})).max(6);
const safetyInputShape=z.strictObject({text:questionTextSchema,context:context(4096)});
export const safetyInputSchema=safetyInputShape.refine(({context})=>context.reduce((sum,turn)=>sum+turn.text.length,0)<=8512);
// Output combines the complete original with all visible source metadata, not
// conversation history. Allow bounded JSON framing (including escaped quotes)
// and size the whole context in bytes. The adapter still enforces the complete
// 20,960-byte request and unchanged price/output caps before network dispatch.
export const outputSafetyInputSchema=safetyInputShape.extend({context:context(8192)})
  .refine(({context})=>Buffer.byteLength(JSON.stringify(context),'utf8')<=16384);
export type SafetyInput = z.infer<typeof safetyInputSchema>;
import type { ProviderUsage } from "@/server/ai/usage";
export interface SafetyProvider {
  accepts?(input: SafetyInput): boolean;
  usage?(): ProviderUsage | undefined;
  readonly modelId: string;
  classify(input: SafetyInput, signal: AbortSignal): Promise<unknown>;
}
export class SafetyProviderError extends Error {
  constructor(readonly reason: "PROVIDER_UNAVAILABLE" | "MALFORMED_OUTPUT" | "TIMEOUT") {
    super("Safety classifier unavailable.");
  }
}
