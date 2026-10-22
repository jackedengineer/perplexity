import { z } from "zod";

export const SAFETY_POLICY = Object.freeze({
  version: "v1",
  requiredChecks: Object.freeze(["INPUT", "OUTBOUND_QUERY", "EVIDENCE", "OUTPUT"] as const),
  classifierTools: Object.freeze([] as const),
});
export const CATEGORY_DEFINITIONS = Object.freeze({
  CREDENTIAL_THEFT: "Enabling credential theft; awareness and defensive education are allowed.",
  FRAUD: "Enabling scams, forgery or financial fraud; prevention and analysis are allowed.",
  UNAUTHORIZED_INTRUSION: "Enabling unauthorized access; authorized defensive assessment is allowed.",
  MALWARE: "Enabling malicious software deployment; defensive detection and analysis are allowed.",
  VIOLENCE: "Actionable assistance for violence; history, prevention and non-operational analysis are allowed.",
  SEXUAL_EXPLOITATION: "Sexual exploitation, abuse or sexual content involving minors; prevention and reporting are allowed.",
  SELF_HARM_INSTRUCTIONS: "Instructions enabling self-injury; stop the research path and provide supportive content.",
  SELF_HARM_DISTRESS: "Help-seeking distress requiring supportive content, rather than a generic refusal.",
  PRIVATE_DATA: "Disclosing nonpublic personal information without entitlement; general privacy advice is allowed.",
  ACCIDENTAL_SECRET: "High-confidence credentials in input; require redacted resubmission before external forwarding.",
  PROMPT_INJECTION: "Attempts to override application policy or access boundaries; discussion of defenses is allowed.",
});
export type SafetyCategory = keyof typeof CATEGORY_DEFINITIONS;
export const safetyCategorySchema = z.enum(Object.keys(CATEGORY_DEFINITIONS) as [SafetyCategory, ...SafetyCategory[]]);
const policyVersion = z.literal(SAFETY_POLICY.version);
export const guardVerdictSchema = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("ALLOW"), categoryCodes: z.array(safetyCategorySchema).length(0), policyVersion }),
  z.strictObject({ decision: z.literal("BLOCK"), categoryCodes: z.array(safetyCategorySchema).min(1)
    .max(Object.keys(CATEGORY_DEFINITIONS).length).refine((codes) => new Set(codes).size === codes.length), policyVersion }),
  z.strictObject({ decision: z.literal("UNAVAILABLE"), retryable: z.boolean(), policyVersion }),
]);
export type GuardVerdict = z.infer<typeof guardVerdictSchema>;

// Shape validation only; no semantic classifier is implemented by this function.
// Provider/SDK errors must never become an implicit ALLOW or raw public prose.
export function normalizeSafetyVerdict(value: unknown): GuardVerdict {
  try {
    const result = guardVerdictSchema.safeParse(value);
    if (result.success) return result.data;
  } catch { /* Invalid provider objects are unavailable, including throwing accessors. */ }
  return { decision: "UNAVAILABLE", retryable: false, policyVersion: SAFETY_POLICY.version };
}
