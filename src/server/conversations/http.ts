import { ZodError } from "zod";
import { conversationId, createInput, historyInput, listInput, renameInput } from "./contracts";
import { ConversationError } from "./errors";
import type { ConversationRepository } from "./repository";

type Operation = "create" | "list" | "get" | "history" | "rename";
type Dependencies = {
  repository: () => ConversationRepository;
  origin: () => string;
  identity: (request: Request) => Promise<{ user: { id: string } } | null>;
  log: (event: { event: string; requestId: string; operation: Operation; status: number; durationMs: number }) => void;
};

async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ConversationError("UNSUPPORTED_MEDIA_TYPE");
  }
  const maxBytes = 2048;
  if (Number(request.headers.get("content-length")) > maxBytes) throw new ConversationError("TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new ConversationError("MALFORMED_JSON");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ConversationError("TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ConversationError("MALFORMED_JSON"); }
}

export function createConversationHttp(dependencies: Dependencies) {
  return {
    async handle(request: Request, operation: Operation, id?: string) {
      const requestId = crypto.randomUUID();
      const start = performance.now();
      let response: Response;
      try {
        if (["create", "rename"].includes(operation) && request.headers.get("origin") !== new URL(dependencies.origin()).origin) {
          throw new ConversationError("INVALID_ORIGIN");
        }
        const identity = await dependencies.identity(request);
        if (!identity) throw new ConversationError("UNAUTHENTICATED");
        const subject = identity.user.id;
        const repository = dependencies.repository();
        const query = Object.fromEntries(new URL(request.url).searchParams);
        if (operation === "create") {
          const result = await repository.create(subject, createInput.parse(await readJson(request)));
          response = Response.json({ ...result, requestId }, { status: result.created ? 201 : 200 });
        } else if (operation === "list") {
          response = Response.json({ ...await repository.list(subject, listInput.parse(query)), requestId });
        } else {
          if (!conversationId.safeParse(id).success) throw new ConversationError("NOT_FOUND");
          if (operation === "rename") {
            const conversation = await repository.rename(subject, id!, renameInput.parse(await readJson(request)));
            response = Response.json({ conversation, requestId });
          } else {
            const result = await repository.history(subject, id!, historyInput.parse(query));
            response = operation === "get"
              ? Response.json({ conversation: result.conversation, messages: result.items, nextBefore: result.nextBefore, requestId })
              : Response.json({ items: result.items, nextBefore: result.nextBefore, requestId });
          }
        }
      } catch (error) {
        const failure = error instanceof ConversationError ? error
          : new ConversationError(error instanceof ZodError ? "INVALID_INPUT" : "UNAVAILABLE");
        response = Response.json({ error: { code: failure.code, message: failure.message }, requestId }, { status: failure.status });
      }
      const durationMs = Math.round(performance.now() - start);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Request-Id", requestId);
      response.headers.set("Server-Timing", `conversations;dur=${durationMs}`);
      dependencies.log({ event: "conversations.request", requestId, operation, status: response.status, durationMs });
      return response;
    },
  };
}
