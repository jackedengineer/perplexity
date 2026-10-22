import { z } from "zod";

import { PUBLIC_ERRORS as errors } from "./error-messages";
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
