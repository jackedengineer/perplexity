import { normalizeSafetyVerdict, SAFETY_POLICY } from "./policy";

export const SAFETY_RESPONSES = Object.freeze({
  HARMFUL_ASSISTANCE: Object.freeze({ code: "REQUEST_BLOCKED", text: "I can’t help with instructions that enable harm or abuse. I can help with prevention, safety, or a lawful alternative." }),
  PRIVATE_DATA: Object.freeze({ code: "PRIVATE_DATA", text: "I can’t help disclose someone’s private information or credentials. I can help with privacy protection or legitimate access methods." }),
  REDACT_SECRET: Object.freeze({ code: "REDACT_SECRET", text: "Your request appears to contain a private credential. Remove or redact it and submit your question again." }),
  SUPPORT: Object.freeze({ code: "SUPPORT", text: "You deserve support. If you may be in immediate danger, contact local emergency services or someone you trust now. I can help you find support and focus on staying safe." }),
  UNAVAILABLE: Object.freeze({ code: "SAFETY_UNAVAILABLE", text: "Safety checks are temporarily unavailable. Please try again later." }),
} as const);
export type SafetyResponse = typeof SAFETY_RESPONSES[keyof typeof SAFETY_RESPONSES];
export type SafetyDecision =
  | { decision: "ALLOW"; policyVersion: typeof SAFETY_POLICY.version }
  | { decision: "BLOCK" | "UNAVAILABLE"; policyVersion: typeof SAFETY_POLICY.version; response: SafetyResponse };

// Select only application-owned templates. Category order cannot alter precedence.
// ALLOW here validates one verdict; it is not approval to release an answer or skip another gate.
export function resolveSafetyDecision(value: unknown): SafetyDecision {
  const verdict = normalizeSafetyVerdict(value);
  if (verdict.decision === "ALLOW") return { decision: "ALLOW", policyVersion: verdict.policyVersion };
  if (verdict.decision === "UNAVAILABLE") return { decision: "UNAVAILABLE", policyVersion: verdict.policyVersion, response: SAFETY_RESPONSES.UNAVAILABLE };
  const categories = new Set(verdict.categoryCodes);
  const response = categories.has("SELF_HARM_DISTRESS") || categories.has("SELF_HARM_INSTRUCTIONS") ? SAFETY_RESPONSES.SUPPORT
    : categories.has("ACCIDENTAL_SECRET") ? SAFETY_RESPONSES.REDACT_SECRET
    : categories.has("PRIVATE_DATA") ? SAFETY_RESPONSES.PRIVATE_DATA : SAFETY_RESPONSES.HARMFUL_ASSISTANCE;
  return { decision: "BLOCK", policyVersion: verdict.policyVersion, response };
}
