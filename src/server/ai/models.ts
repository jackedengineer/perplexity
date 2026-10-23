import { z } from "zod";
export const modelIdSchema = z.string().max(128).regex(/^[a-z0-9-]+\/[A-Za-z0-9._:-]+$/u);
const configSchema = z.strictObject({
  apiKey: z.string().min(16).max(256).regex(/^[A-Za-z0-9._-]+$/u),
  modelId: modelIdSchema,
  provider: z.string().max(64).regex(/^[a-z0-9][a-z0-9.-]*(?:\/[a-z0-9.-]+)?$/u),
});
export type SafetyModelConfig = z.infer<typeof configSchema>;
// Lazy and fail-closed. No public/browser model selector can supply these settings.
export function parseSafetyModel(env: Record<string,string | undefined>): SafetyModelConfig | undefined {
  const parsed = configSchema.safeParse({ apiKey: env.OPENROUTER_API_KEY, modelId: env.MODEL_SAFETY, provider: env.SAFETY_OPENROUTER_PROVIDER });
  return parsed.success ? Object.freeze(parsed.data) : undefined;
}

export function parseAnswerModel(env: Record<string,string | undefined>): SafetyModelConfig | undefined {
  return parseSafetyModel({ ...env,MODEL_SAFETY: env.MODEL_ANSWER,SAFETY_OPENROUTER_PROVIDER: env.ANSWER_OPENROUTER_PROVIDER });
}
