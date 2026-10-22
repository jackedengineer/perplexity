import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { submissionSchema } from "@/server/contracts/chat";
import { SAFETY_POLICY } from "@/server/safety/policy";
import { AdmissionError } from "./errors";

const keyId = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/u);
const configSchema = z.strictObject({ activeKeyId: keyId, keys: z.record(keyId, z.string().regex(/^[a-f0-9]{64}$/u)) })
  .refine((value) => Object.hasOwn(value.keys, value.activeKeyId) && Object.keys(value.keys).length <= 8);
export type AdmissionConfig = z.infer<typeof configSchema>;
export function parseAdmissionConfig(value: unknown): AdmissionConfig {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
  return Object.freeze({ activeKeyId: parsed.data.activeKeyId, keys: Object.freeze(parsed.data.keys) });
}
const version = z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/u);
const snapshotSchema = z.object({
  catalogVersion: version, priceVersion: version, entitlementVersion: version, operatorBudgetKey: version,
  policyVersion: version.max(32), answerCredits: z.int().min(1).max(15),
  providerReserveMicroUsd: z.bigint().min(1n).max(150_000n),
});
export type AdmissionSnapshot = z.infer<typeof snapshotSchema>;
export const admissionPolicySchema = snapshotSchema.omit({ entitlementVersion: true }).extend({
  policyVersion: z.literal(SAFETY_POLICY.version), attemptsPerMinute: z.int().min(1).max(100),
  attemptsPerDay: z.int().min(1).max(10_000), deadlineMs: z.literal(45_000),
});
export type AdmissionPolicy = z.infer<typeof admissionPolicySchema>;
export const FREE_ADMISSION_POLICY: AdmissionPolicy = Object.freeze({
  catalogVersion: "fast-v1", priceVersion: "standard-v1", operatorBudgetKey: "research", policyVersion: SAFETY_POLICY.version,
  answerCredits: 5, providerReserveMicroUsd: 50_000n, attemptsPerMinute: 3, attemptsPerDay: 20, deadlineMs: 45_000,
});
export function fingerprintSubmission(input: unknown, snapshot: AdmissionSnapshot, config: AdmissionConfig) {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) throw new AdmissionError("INVALID_INPUT");
  const quote = snapshotSchema.safeParse(snapshot);
  if (!quote.success) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
  const valid = parseAdmissionConfig(config);
  const request = parsed.data;
  const canonical = JSON.stringify({ version: 1,
    conversationId: request.conversationId.toLowerCase(), clientRequestId: request.clientRequestId.toLowerCase(),
    expectedRevision: request.expectedRevision, text: request.message.text, mode: request.mode, modelKey: request.modelKey,
    locale: request.locale ?? null, timezone: request.timezone ?? null,
    snapshot: { ...quote.data, providerReserveMicroUsd: quote.data.providerReserveMicroUsd.toString() },
  });
  return { hmac: createHmac("sha256", Buffer.from(valid.keys[valid.activeKeyId], "hex"))
    .update("perplex:run-admission:v1\0").update(canonical).digest("hex"), keyId: valid.activeKeyId, version: 1 };
}
export function matchesFingerprint(input: unknown, snapshot: AdmissionSnapshot,
  stored: { hmac: string; keyId: string; version: number }, config: AdmissionConfig) {
  if (stored.version !== 1 || !/^[a-f0-9]{64}$/u.test(stored.hmac) || !Object.hasOwn(config.keys, stored.keyId)) {
    throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
  }
  const candidate = fingerprintSubmission(input, snapshot, { activeKeyId: stored.keyId, keys: config.keys });
  return timingSafeEqual(Buffer.from(stored.hmac, "hex"), Buffer.from(candidate.hmac, "hex"));
}
