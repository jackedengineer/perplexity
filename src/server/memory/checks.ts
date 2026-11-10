import { isGrounded, isNegated, isSensitive } from "./gate";
import { memoryText, type MemoryOperation } from "./store";

export type RejectionReason = "UNKNOWN_ID" | "REPEATED_ID" | "SENSITIVE" | "UNGROUNDED" | "NEGATED" | "COMBINED";

// One fact per memory, so forgetting one never takes another with it. "Works as a civil engineer.
// Lives in Pune." becomes two memories; an UPDATE that merges facts is dropped instead.
export const facts = (text: string) => memoryText(text).split(/(?<=[.;!])\s+/u).map(part => part.replace(/[.;!]+$/u, "").trim()).filter(part => part.length >= 3);

// Every operation the model proposes is checked on its own: one bad operation is dropped and
// the rest still apply. Ids must be ones we sent, and saved text must be the user's own words.
export function checkOperations(operations: readonly MemoryOperation[], existingIds: ReadonlySet<string>, message: string) {
  const accepted: MemoryOperation[] = [], rejected: RejectionReason[] = [], touched = new Set<string>();
  const split = operations.flatMap<MemoryOperation>(operation => operation.op === "ADD" ? facts(operation.text).map(text => ({ ...operation, text })) : [operation]);
  for (const operation of split) {
    if (operation.op === "UPDATE" && facts(operation.text).length > 1) { rejected.push("COMBINED"); continue; }
    if (operation.op !== "ADD") {
      if (!existingIds.has(operation.id)) { rejected.push("UNKNOWN_ID"); continue; }
      if (touched.has(operation.id)) { rejected.push("REPEATED_ID"); continue; }
    }
    if (operation.op !== "DELETE") {
      const text = memoryText(operation.text);
      if (isSensitive(text)) { rejected.push("SENSITIVE"); continue; }
      if (!isGrounded(text, message)) { rejected.push("UNGROUNDED"); continue; }
      if (isNegated(text, message)) { rejected.push("NEGATED"); continue; }
    }
    if (operation.op !== "ADD") touched.add(operation.id);
    accepted.push(operation);
  }
  return { accepted, rejected };
}
