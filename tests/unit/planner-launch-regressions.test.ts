import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  standaloneFallback,
  validatePlan,
  type PlannerInput,
} from "@/server/ai/plan";

function request(text: string): PlannerInput {
  return {
    original: { id: randomUUID(), text },
    context: [],
    now: "2026-10-24T07:30:00.000Z",
    timezone: "Asia/Kolkata",
    locale: null,
  };
}

function answer(standaloneQuestion: string, query = standaloneQuestion) {
  return {
    action: "ANSWER",
    standaloneQuestion,
    intent: "EXPLAIN",
    explicitConstraints: [],
    disclosedAssumptions: [],
    retrieval: {
      required: true,
      queries: [query],
      freshness: "ANY",
      startDate: null,
      endDate: null,
    },
    answerLanguage: "en",
  };
}

describe("production planner regressions", () => {
  it("accepts subject-preserving search compression without answer presentation instructions", () => {
    const input = request(
      "What causes a rainbow? Give a short explanation with reliable sources.",
    );

    const plan = validatePlan(
      answer(input.original.text, "rainbow causes"),
      input,
    );

    expect(plan).toMatchObject({
      action: "ANSWER",
      standaloneQuestion: input.original.text,
      retrieval: { queries: ["rainbow causes"] },
    });
  });

  it("does not treat one-time as an unresolved reference to conversation history", () => {
    const input = request("What is a one-time password?");

    expect(validatePlan(answer(input.original.text), input)).toMatchObject({
      action: "ANSWER",
      standaloneQuestion: input.original.text,
    });
  });

  it("does not restrict electrical-current explanations to recent publications", () => {
    const input = request("Explain electric current");

    expect(standaloneFallback(input)).toMatchObject({
      action: "ANSWER",
      retrieval: { freshness: "ANY", queries: [input.original.text] },
    });
  });

  it("rejects an arbitrary single-entity resolution when history has multiple possible referents", () => {
    const input = request("What about its pricing?");
    input.context = [
      { id: randomUUID(), role: "USER", text: "Compare Neon and Supabase" },
    ];

    expect(() =>
      validatePlan(answer("What about Neon pricing?", "Neon pricing"), input),
    ).toThrow("Planning unavailable");
    expect(
      validatePlan(
        {
          action: "CLARIFY",
          question: "Which product do you mean?",
          reasonCode: "AMBIGUOUS_REFERENCE",
        },
        input,
      ),
    ).toMatchObject({ action: "CLARIFY" });
  });
});
