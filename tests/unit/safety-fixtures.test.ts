import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { z } from "zod";
import fixtures from "../fixtures/safety-v1.json";
import { questionTextSchema, submissionSchema } from "@/server/contracts/chat";
import { CATEGORY_DEFINITIONS, guardVerdictSchema, SAFETY_POLICY } from "@/server/safety/policy";
import { resolveSafetyDecision } from "@/server/safety/responses";

const fixtureSchema = z.strictObject({
  id: z.string().min(1), pair: z.string().min(1), stage: z.enum(SAFETY_POLICY.requiredChecks), text: questionTextSchema,
  context: z.array(z.strictObject({ role: z.enum(["USER", "ASSISTANT"]), text: questionTextSchema })).max(3).optional(),
  expected: guardVerdictSchema, publicCode: z.string().nullable(),
});

it("keeps the labeled seed set complete, paired and usable by a future evaluator", () => {
  const cases = z.array(fixtureSchema).min(30).parse(fixtures);
  expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
  const covered = new Set(cases.flatMap((item) => item.expected.decision === "BLOCK" ? item.expected.categoryCodes : []));
  expect([...covered].sort()).toEqual(Object.keys(CATEGORY_DEFINITIONS).sort());
  expect(new Set(cases.map((item) => item.stage))).toEqual(new Set(SAFETY_POLICY.requiredChecks));
  for (const pair of new Set(cases.map((item) => item.pair))) {
    expect(new Set(cases.filter((item) => item.pair === pair).map((item) => item.expected.decision))).toEqual(new Set(["ALLOW", "BLOCK"]));
  }
});

// This checks policy expectations/transport semantics, not semantic classifier accuracy.
// There is deliberately no keyword classifier or allow-all SafetyProvider stub.
it.each(fixtures)("preserves the labeled decision and fixed public response: $id", (fixture) => {
  const item = fixtureSchema.parse(fixture);
  const result = resolveSafetyDecision(item.expected);
  expect(result.decision).toBe(item.expected.decision);
  expect(result.decision === "ALLOW" ? null : result.response.code).toBe(item.publicCode);
  if (item.stage === "INPUT") {
    const submitted = submissionSchema.parse({ conversationId: randomUUID(), clientRequestId: randomUUID(),
      expectedRevision: 0, mode: "FAST", modelKey: "fast-default", message: { text: item.text } });
    expect(submitted.message.text).toBe(item.text);
  }
});
