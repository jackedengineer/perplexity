import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { attachedFilesPlan, clarifyUnresolvedReference, literalQuestionPlan, validatePlan, type PlannerInput } from "@/server/ai/plan";
import { mixResults } from "@/server/search/retrieve";
import type { RankedResult } from "@/server/search/rank";

const input = (text: string, files?: string[]): PlannerInput => ({ original: { id: randomUUID(), text }, context: [], now: "2026-11-08T09:00:00.000Z", timezone: "UTC", locale: null, ...(files ? { files } : {}) });
const answer = (question: string, queries = [question]) => ({ action: "ANSWER", standaloneQuestion: question, intent: "EXPLAIN", explicitConstraints: [], disclosedAssumptions: [],
  retrieval: { required: true, queries, freshness: "ANY", startDate: null, endDate: null }, answerLanguage: "en" });
const reason = (run: () => unknown) => { try { run(); return "OK"; } catch (error) { return (error as { reason: string }).reason; } };

describe("planning a question with attached files", () => {
  it("resolves 'this report' to the attached file instead of rejecting the reference", () => {
    const text = "What does this report say about turbidity?";
    expect(reason(() => validatePlan(answer(text), input(text)))).toBe("PLAN_REFERENCE");
    expect(reason(() => validatePlan(answer(text), input(text, ["aurora-water-report.pdf"])))).toBe("OK");
  });

  it("lets a query use words from the file's title", () => {
    const text = "What is the turbidity in this?";
    expect(reason(() => validatePlan(answer("What is the turbidity in the aurora water report?", ["aurora water report turbidity"]), input(text, ["aurora-water-report.pdf"])))).toBe("OK");
    expect(reason(() => validatePlan(answer("What is the turbidity in the aurora water report?", ["aurora water report turbidity"]), input(text)))).not.toBe("OK");
  });

  it("never asks which document the user means", () => {
    const clarify = { action: "CLARIFY", question: "Which report do you mean?", reasonCode: "AMBIGUOUS_REFERENCE" };
    expect(reason(() => validatePlan(clarify, input("Is this accurate?", ["report.pdf"])))).toBe("PLAN_CLARIFY");
    expect(clarifyUnresolvedReference(input("Is this accurate?"))).toMatchObject({ action: "CLARIFY" });
    expect(clarifyUnresolvedReference(input("Is this accurate?", ["report.pdf"]))).toBeNull();
  });

  it("answers 'Summarize this' when a file is attached, and still refuses it without one", () => {
    expect(reason(() => validatePlan(answer("Summarize this"), input("Summarize this")))).not.toBe("OK");
    expect(literalQuestionPlan(input("Summarize this", ["report.pdf"]))).toBeNull();
    expect(attachedFilesPlan(input("Summarize this", ["report.pdf"]))).toMatchObject({ action: "ANSWER", retrieval: { queries: ["Summarize this"] } });
    expect(attachedFilesPlan(input("Summarize this"))).toBeNull();
  });

  it("keeps negations and numbers from the question even with files attached", () => {
    const text = "List costs in this file not including the 2024 budget";
    expect(reason(() => validatePlan(answer("List costs in this file", ["costs"]), input(text, ["budget.pdf"])))).not.toBe("OK");
  });
});

describe("mixing file pages with web results", () => {
  const result = (title: string): RankedResult => ({ title, url: `https://example.org/${title}`, content: title, score: 1, contentKind: "SEARCH_PASSAGE", retrievedAt: "2026-11-08T09:00:00.000Z" } as RankedResult);
  it("alternates the two sources and caps file pages at three", () => {
    const files = ["f1", "f2", "f3", "f4"].map(result), web = ["w1", "w2", "w3", "w4"].map(result);
    expect(mixResults(files, web).map(r => r.title)).toEqual(["f1", "w1", "f2", "w2", "f3", "w3", "w4"]);
  });
  it("uses one source unchanged when the other is empty", () => {
    const files = ["f1", "f2", "f3", "f4", "f5"].map(result);
    expect(mixResults(files, [])).toBe(files);
    expect(mixResults([], files)).toBe(files);
  });
});
