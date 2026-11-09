import { isGrounded, isSensitive } from "./gate";
import { memoryText, type MemoryOperation } from "./store";

export type RejectionReason = "UNKNOWN_ID" | "REPEATED_ID" | "SENSITIVE" | "UNGROUNDED";

// Every operation the model proposes is checked on its own: one bad operation is dropped and
// the rest still apply. Ids must be ones we sent, and saved text must be the user's own words.
export function checkOperations(operations: readonly MemoryOperation[], existingIds: ReadonlySet<string>, message: string) {
  const accepted: MemoryOperation[] = [], rejected: RejectionReason[] = [], touched = new Set<string>();
  for (const operation of operations) {
    if (operation.op !== "ADD") {
      if (!existingIds.has(operation.id)) { rejected.push("UNKNOWN_ID"); continue; }
      if (touched.has(operation.id)) { rejected.push("REPEATED_ID"); continue; }
    }
    if (operation.op !== "DELETE") {
      const text = memoryText(operation.text);
      if (isSensitive(text)) { rejected.push("SENSITIVE"); continue; }
      if (!isGrounded(text, message)) { rejected.push("UNGROUNDED"); continue; }
    }
    if (operation.op !== "ADD") touched.add(operation.id);
    accepted.push(operation);
  }
  return { accepted, rejected };
}
