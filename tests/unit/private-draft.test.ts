import { randomUUID } from "node:crypto";
import { expect,it,vi } from "vitest";
import type { DraftInput } from "@/server/ai/answer";
import { generatePrivateDraft } from "@/server/runs/draft";
import { buildEvidence } from "@/server/search/evidence";
import { createReleaseGate,NO_EVIDENCE_TEXT } from "@/server/safety/release";
const options = () => ({ signal: new AbortController().signal,deadlineAt: new Date(Date.now()+45000) });
const empty = (): DraftInput => ({ question: "Why do rainbows form?",evidence: { runId: randomUUID(),sources: [],passages: [] } });
it("uses fixed no-evidence text without inventing a sourced answer or calling a model",async()=>{
  const provider = { generate: vi.fn() },draft = await generatePrivateDraft(empty(),provider,options());
  expect(draft).toMatchObject({ kind: "NO_EVIDENCE",text: NO_EVIDENCE_TEXT,usage: { costMicroUsd: 0n } });expect(provider.generate).not.toHaveBeenCalled();
  const classifier = { modelId: "test/output",classify: vi.fn().mockResolvedValue({ decision: "ALLOW",categoryCodes: [],policyVersion: "v1" }) },value = empty();
  expect((await createReleaseGate(classifier).approve({ ...value,runId: value.evidence.runId,attemptVersion: 1,revision: 1,kind: draft.kind,markdown: draft.text },options())).kind).toBe("APPROVED");
  expect(classifier.classify).toHaveBeenCalledOnce();
});
it("still requires an answer provider for nonempty evidence and sanitizes its error",async()=>{
  const value = empty();value.evidence = buildEvidence(value.evidence.runId,[{ title: "Source",url: "https://example.org/",content: "Selected",score: 0.9 }],new Date());
  await expect(generatePrivateDraft(value,undefined,options())).rejects.toThrow("Answer unavailable");
  await expect(generatePrivateDraft(value,{ generate: vi.fn().mockRejectedValue(new Error("PRIVATE provider error")) },options())).rejects.toThrow("Answer unavailable");
});
it("cannot use no-evidence handling to bypass cancellation, secrets or payload validation",async()=>{
  const controller = new AbortController();controller.abort();
  await expect(generatePrivateDraft(empty(),undefined,{ ...options(),signal: controller.signal })).rejects.toThrow("Answer unavailable");
  await expect(generatePrivateDraft({ ...empty(),question: "sk-or-v1-"+"a".repeat(64) },undefined,options())).rejects.toThrow("Answer unavailable");
});
