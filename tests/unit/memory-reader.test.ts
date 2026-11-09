import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { draftPrompt, prepareDraftInput } from "@/server/ai/draft-input";
import { chatPrompt, chatSystemPrompt, prepareChatInput, CHAT_PROMPT, CHAT_PROMPT_VERSION } from "@/server/ai/chat-draft";
import { ANSWER_PROMPT, ANSWER_PROMPT_VERSION, answerSystemPrompt } from "@/server/ai/prompts/answer";
import { readerCandidates } from "@/server/ai/reader";
import { fitReader } from "@/server/memory/store";
import { buildEvidence } from "@/server/search/evidence";

const memories = Array.from({ length: 50 }, (_, i) => `Memory ${String(i).padStart(2, "0")} ${"m".repeat(185)}`);
const reader = { instructions: "a".repeat(1000), memories };
const evidence = (count: number, size: number) => buildEvidence(randomUUID(), Array.from({ length: count }, (_, i) => ({ title: `Source ${i}`, url: `https://example.org/${i}`, content: `${i} ${"e".repeat(size)}`, score: 0.9 })), new Date());

describe("what the asker told Perplex, inside the answer budget", () => {
  it("is offered largest first: fewer memories, then About you alone", () => {
    const steps = [...readerCandidates({ instructions: "About", memories: ["a", "b"] })];
    expect(steps).toEqual([{ instructions: "About", memories: ["a", "b"] }, { instructions: "About", memories: ["a"] }, { instructions: "About", memories: [] }]);
    expect([...readerCandidates({ memories: ["a"] })]).toEqual([{ memories: ["a"] }]);
  });

  it("goes into the answer prompt as data, under a rule that keeps it out of evidence and out of the text", () => {
    const prepared = prepareDraftInput({ question: "Concrete suppliers near me", reader: { memories: ["Lives in Pune"] }, evidence: evidence(2, 200) });
    expect(JSON.parse(draftPrompt(prepared)).reader).toEqual({ memories: ["Lives in Pune"] });
    expect(ANSWER_PROMPT_VERSION).toBe("answer-v11");
    expect(answerSystemPrompt(prepared)).toContain("never cite it");
    expect(answerSystemPrompt(prepared)).toContain("Never mention that you remember");
    expect(answerSystemPrompt({})).toBe(ANSWER_PROMPT);
  });

  it("drops memories, least important last, before any source", () => {
    const sources = evidence(5, 3500);
    const prepared = prepareDraftInput({ question: "Explain M25 concrete", reader, evidence: sources });
    expect(prepared.evidence.sources).toHaveLength(sources.sources.length);
    expect(prepared.reader?.instructions).toBe(reader.instructions);
    expect(prepared.reader!.memories.length).toBeGreaterThan(0);
    expect(prepared.reader!.memories.length).toBeLessThan(50);
    expect(prepared.reader!.memories).toEqual(memories.slice(0, prepared.reader!.memories.length));
  });

  it("leaves no reader at all when even the sources must be cut", () => {
    const sources = buildEvidence(randomUUID(), Array.from({ length: 5 }, (_, i) => ({ title: `Source ${i}`, url: `https://example.org/${i}`, content: "光".repeat(1000), score: 0.9 })), new Date());
    const withReader = prepareDraftInput({ question: "界".repeat(4000), reader, evidence: sources });
    expect(withReader).toEqual(prepareDraftInput({ question: "界".repeat(4000), evidence: sources }));
    expect(withReader.reader).toBeUndefined();
  });

  it("does the same in Chat, keeping the conversation history whole", () => {
    const input = { question: "q".repeat(4000), context: Array.from({ length: 4 }, (_, i) => ({ role: i % 2 ? "ASSISTANT" as const : "USER" as const, text: `${i}${"h".repeat(2500)}` })), evidence: { runId: randomUUID(), sources: [], passages: [] } };
    const prepared = prepareChatInput({ ...input, reader });
    expect(prepared.context).toHaveLength(4);
    expect(prepared.reader!.memories.length).toBeLessThan(50);
    expect(JSON.parse(chatPrompt(prepared)).reader.instructions).toBe(reader.instructions);
    expect(CHAT_PROMPT_VERSION).toBe("chat-v3");
    expect(chatSystemPrompt(prepared)).toContain("never cite it");
    expect(chatSystemPrompt({})).toBe(CHAT_PROMPT);
    expect(() => prepareChatInput({ ...input, reader: { memories: ["x".repeat(201)] } })).toThrow();
  });
});

describe("choosing memories for the reader", () => {
  it("puts preferences first and fits whole items into the budget", () => {
    const at = (n: number) => new Date(Date.UTC(2026, 10, n));
    const items = [
      { id: "1", kind: "CONTEXT" as const, text: "Learning Rust", createdAt: at(3) },
      { id: "2", kind: "PROFILE" as const, text: "Lives in Pune", createdAt: at(1) },
      { id: "3", kind: "PROFILE" as const, text: "Works as a civil engineer", createdAt: at(2) },
      { id: "4", kind: "PREFERENCE" as const, text: "Prefers short answers", createdAt: at(1) },
    ];
    expect(fitReader(null, items)).toEqual({ memories: ["Prefers short answers", "Works as a civil engineer", "Lives in Pune", "Learning Rust"] });
    expect(fitReader("x".repeat(30), items, 60)).toEqual({ instructions: "x".repeat(30), memories: ["Prefers short answers"] });
    expect(fitReader(null, [])).toBeNull();
  });
});
