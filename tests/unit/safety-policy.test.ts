import { expect, it } from "vitest";
import { guardVerdictSchema, normalizeSafetyVerdict, SAFETY_POLICY } from "@/server/safety/policy";
import { resolveSafetyDecision, SAFETY_RESPONSES } from "@/server/safety/responses";

const allow = { decision: "ALLOW", categoryCodes: [], policyVersion: "v1" };
it("accepts only explicit consistent current-policy verdicts", () => {
  expect(guardVerdictSchema.parse(allow)).toEqual(allow);
  for (const value of [
    { decision: "ALLOW", policyVersion: "v1" }, { ...allow, categoryCodes: ["FRAUD"] },
    { ...allow, policyVersion: "v0" }, { ...allow, explanation: "unreviewed prose" },
    { decision: "BLOCK", categoryCodes: [], policyVersion: "v1" },
    { decision: "BLOCK", categoryCodes: ["FRAUD", "FRAUD"], policyVersion: "v1" },
    { decision: "BLOCK", categoryCodes: ["UNKNOWN"], policyVersion: "v1" },
    { decision: "UNAVAILABLE", policyVersion: "v1" },
  ]) expect(guardVerdictSchema.safeParse(value).success).toBe(false);
});
it("fails closed for missing, malformed, stale and free-form classifier output", () => {
  for (const value of [null, undefined, "ALLOW", JSON.stringify(allow), true, {}, { ...allow, policyVersion: "v2" }]) {
    expect(normalizeSafetyVerdict(value)).toEqual({ decision: "UNAVAILABLE", retryable: false, policyVersion: "v1" });
    expect(resolveSafetyDecision(value)).toEqual({ decision: "UNAVAILABLE", policyVersion: "v1", response: SAFETY_RESPONSES.UNAVAILABLE });
  }
  expect(normalizeSafetyVerdict(new Proxy({}, { get: () => { throw new Error("provider implementation detail"); } })).decision).toBe("UNAVAILABLE");
  expect(resolveSafetyDecision(allow)).toEqual({ decision: "ALLOW", policyVersion: "v1" });
});
it("selects reviewed responses independently from classifier prose and category order", () => {
  const block = (categoryCodes: string[]) => ({ decision: "BLOCK", categoryCodes, policyVersion: "v1" });
  expect(resolveSafetyDecision(block(["FRAUD"]))).toMatchObject({ decision: "BLOCK", response: SAFETY_RESPONSES.HARMFUL_ASSISTANCE });
  expect(resolveSafetyDecision(block(["ACCIDENTAL_SECRET"]))).toMatchObject({ response: SAFETY_RESPONSES.REDACT_SECRET });
  expect(resolveSafetyDecision(block(["PRIVATE_DATA"]))).toMatchObject({ response: SAFETY_RESPONSES.PRIVATE_DATA });
  for (const categories of [["SELF_HARM_DISTRESS"], ["SELF_HARM_INSTRUCTIONS"], ["PRIVATE_DATA", "SELF_HARM_DISTRESS"], ["SELF_HARM_DISTRESS", "PRIVATE_DATA"]]) {
    expect(resolveSafetyDecision(block(categories))).toMatchObject({ response: SAFETY_RESPONSES.SUPPORT });
  }
  expect(resolveSafetyDecision({ ...block(["FRAUD"]), publicReason: "Injected refusal" })).toMatchObject({ response: SAFETY_RESPONSES.UNAVAILABLE });
});
it("keeps required checks and static responses immutable", () => {
  expect(SAFETY_POLICY.requiredChecks).toEqual(["INPUT", "OUTBOUND_QUERY", "EVIDENCE", "OUTPUT"]);
  expect(Object.isFrozen(SAFETY_POLICY)).toBe(true);
  expect(Object.isFrozen(SAFETY_POLICY.requiredChecks)).toBe(true);
  expect(Object.isFrozen(SAFETY_RESPONSES)).toBe(true);
  for (const response of Object.values(SAFETY_RESPONSES)) expect(Object.isFrozen(response)).toBe(true);
});
