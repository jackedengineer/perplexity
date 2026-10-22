import { z } from "zod";

const errors = {
  MALFORMED_JSON: [400, "The request must contain valid JSON."],
  UNAUTHENTICATED: [401, "Sign in to continue."],
  INVALID_ORIGIN: [403, "Untrusted request origin."],
  NOT_FOUND: [404, "This resource is unavailable."],
  CONFLICT: [409, "This conversation changed. Reload and try again."],
  RUN_IN_PROGRESS: [409, "This request is already running. Check its current status."],
  RUN_ALREADY_FINISHED: [409, "This request already finished. Load its saved result."],
  TOO_LARGE: [413, "The request is too large."],
  UNSUPPORTED_MEDIA_TYPE: [415, "Use application/json for this request."],
  INVALID_INPUT: [422, "Check the request fields and try again."],
  IDEMPOTENCY_MISMATCH: [422, "This request key was already used for a different question."],
  RATE_LIMITED: [429, "Too many requests. Please wait before trying again."],
  BUDGET_EXCEEDED: [429, "Your available research allowance has been reached."],
  INPUT_BLOCKED: [403, "This request cannot proceed under the safety policy."],
  OUTPUT_BLOCKED: [403, "We couldn’t safely provide an answer to this request."],
  SAFETY_UNAVAILABLE: [503, "Safety checks are temporarily unavailable. Please try again later."],
  PROVIDER_UNAVAILABLE: [503, "Research is temporarily unavailable. Please try again later."],
  CONFIGURATION_UNAVAILABLE: [503, "Research is not available right now."],
} as const;
export type PublicErrorCode = keyof typeof errors;
const errorCodeSchema = z.enum(Object.keys(errors) as [PublicErrorCode, ...PublicErrorCode[]]);
export const publicErrorSchema = z.strictObject({
  error: z.strictObject({ code: errorCodeSchema, message: z.string().max(160) }), requestId: z.uuid(),
}).refine(({ error }) => error.message === errors[error.code][1], "Use the fixed public error message");
export function createPublicError(code: PublicErrorCode, requestId: string) {
  const validCode = errorCodeSchema.parse(code);
  const [status, message] = errors[validCode];
  return { status, body: publicErrorSchema.parse({ error: { code: validCode, message }, requestId }) };
}
export type PublicError = z.infer<typeof publicErrorSchema>;
