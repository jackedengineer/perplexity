import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { parsePlannerModel } from "@/server/ai/models";
import { createExtractionProvider } from "@/server/memory/extract";
import { mentionsSelf } from "@/server/memory/gate";
import type { MemoryOperation } from "@/server/memory/store";
import { loadMemoryCases, scoreMemory } from "../../evals/memory";

// Opt-in: LIVE_MEMORY_EVAL=1 with OPENROUTER_API_KEY, MODEL_PLANNER and PLANNER_OPENROUTER_PROVIDER set.
// Sends about 34 short synthetic messages to the planner model (roughly $0.005 in total). No user data.
it("meets the memory targets with the real extraction model", async () => {
  const config = parsePlannerModel(process.env);
  if (process.env.LIVE_MEMORY_EVAL !== "1" || !config) throw new Error("Explicit live memory evaluation opt-in required");
  const provider = createExtractionProvider(config), cases = await loadMemoryCases(), replies = new Map<string, MemoryOperation[]>();
  let cost = 0n;
  for (const c of cases.filter(c => mentionsSelf(c.message))) {
    try {
      const result = await provider.extract({ message: c.message, memories: c.existing ?? [] }, { signal: AbortSignal.timeout(15000), deadlineAt: new Date(Date.now() + 15000) });
      replies.set(c.id, result.operations);
    } catch { replies.set(c.id, []); }
    cost += provider.usage?.()?.costMicroUsd ?? 0n;
  }
  const score = scoreMemory(cases, replies);
  console.log(JSON.stringify({ cases: score.cases, calls: score.calls, correct: score.correct, wrong: score.wrong, sensitiveSaves: score.sensitiveSaves, ungroundedSaves: score.ungroundedSaves, costMicroUsd: cost.toString() }));
  await writeFile(".artifacts/memory-eval.json", JSON.stringify({ ...score, replies: Object.fromEntries(replies) }, null, 1));
  expect(score.sensitiveSaves).toBe(0);
  expect(score.ungroundedSaves).toBe(0);
  expect(score.wrong.length).toBeLessThanOrEqual(1);
}, 600000);
