import { readFile } from "node:fs/promises";
import { checkOperations } from "@/server/memory/checks";
import { isGrounded, isSensitive, mentionsSelf } from "@/server/memory/gate";
import { memoryText, type MemoryOperation, type StoredMemory } from "@/server/memory/store";

export type MemoryCase = { id: string; category: string; message: string; existing?: StoredMemory[]; proposed: MemoryOperation[]; expected: string[] };
export async function loadMemoryCases(path = "evals/memory-cases.json"): Promise<MemoryCase[]> {
  const { cases } = JSON.parse(await readFile(path, "utf8")) as { cases: MemoryCase[] };
  // Stands in for a long paste without storing one in the file.
  return cases.map(c => ({ ...c, message: c.message.replace("THE_LONG_PASTE", "Quarterly revenue rose across every region. ".repeat(60)) }));
}

// What the user's memory would be after this message: the gate, then the free checks, then the writes.
export function applyCase(c: MemoryCase, reply: readonly MemoryOperation[] = c.proposed) {
  const existing = c.existing ?? [];
  if (!mentionsSelf(c.message)) return { called: false, saved: existing.map(m => m.text).sort(), rejected: [] as string[] };
  const { accepted, rejected } = checkOperations(reply, new Set(existing.map(m => m.id)), c.message);
  let memories = existing.map(m => ({ ...m }));
  const same = (a: string, b: string) => memoryText(a).toLowerCase() === memoryText(b).toLowerCase();
  for (const op of accepted) {
    if (op.op === "DELETE") memories = memories.filter(m => m.id !== op.id);
    else if (op.op === "UPDATE") { if (!memories.some(m => m.id !== op.id && same(m.text, op.text))) memories = memories.map(m => m.id === op.id ? { ...m, text: memoryText(op.text) } : m); }
    else if (!memories.some(m => same(m.text, op.text))) memories.push({ id: `new-${memories.length}`, kind: op.kind, text: memoryText(op.text) });
  }
  return { called: true, saved: memories.map(m => m.text).sort(), rejected: rejected as string[] };
}

export function scoreMemory(cases: readonly MemoryCase[], replies: ReadonlyMap<string, readonly MemoryOperation[]> = new Map()) {
  const results = cases.map(c => {
    const outcome = applyCase(c, replies.get(c.id) ?? c.proposed), before = new Set((c.existing ?? []).map(m => m.text));
    const added = outcome.saved.filter(text => !before.has(text));
    return { id: c.id, category: c.category, ...outcome, correct: JSON.stringify(outcome.saved) === JSON.stringify([...c.expected].sort()),
      sensitive: added.some(isSensitive) || (c.category === "SENSITIVE" && added.length > 0), ungrounded: added.some(text => !isGrounded(text, c.message)) };
  });
  return { cases: results.length, calls: results.filter(r => r.called).length, correct: results.filter(r => r.correct).length,
    wrong: results.filter(r => !r.correct).map(r => r.id), sensitiveSaves: results.filter(r => r.sensitive).length, ungroundedSaves: results.filter(r => r.ungrounded).length, results };
}
