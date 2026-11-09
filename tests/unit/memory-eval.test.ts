import { expect, it } from "vitest";
import { loadMemoryCases, scoreMemory } from "../../evals/memory";

// Offline: the hand-written replies in evals/memory-cases.json include the mistakes a model makes.
// The gate and free checks must still land every case on its label. Targets: 0 sensitive saves,
// 0 ungrounded saves, at most 1 wrong case in 40.
it("lands the labelled memory cases with no sensitive or invented saves", async () => {
  const cases = await loadMemoryCases();
  expect(cases.length).toBeGreaterThanOrEqual(40);
  const score = scoreMemory(cases);
  expect(score.sensitiveSaves).toBe(0);
  expect(score.ungroundedSaves).toBe(0);
  expect(score.wrong).toEqual([]);
  // Impersonal and pasted messages never reach the model.
  expect(score.results.filter(r => ["IMPERSONAL", "PASTED"].includes(r.category)).every(r => !r.called)).toBe(true);
});
