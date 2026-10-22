import { conversationView } from "@/server/conversations/contracts";

export class ConversationRequestError extends Error {
  constructor(readonly status: number) {
    super(status === 409 ? "This conversation changed. Reload before renaming it."
      : status === 401 ? "Your session ended. Please sign in again."
      : "We couldn’t save that change. Please try again.");
  }
}
export async function mutateConversation(path: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(path, {
    method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new ConversationRequestError(response.status);
  const result = await response.json();
  return conversationView.parse(result.conversation);
}
