import { z } from "zod";
import type { ChatIdentity } from "@/server/chat/delivery";
import { createPublicError, type PublicErrorCode } from "@/server/contracts/errors";
import { MEMORY_LIMITS } from "@/db/memory-schema";
import { AdmissionError } from "@/server/runs/errors";
import type { MemorySettingsView } from "./store";

// REST surface for memory settings. There is deliberately no way to list or read memories.
//   GET    /api/memory   { data: { paused, instructions } }
//   PATCH  /api/memory   { paused?, instructions? } -> { data: { paused, instructions } }
//   DELETE /api/memory   permanently deletes every saved memory -> { data: { deleted } }
export type MemoryBackend = {
  settings(subject: string): Promise<MemorySettingsView>;
  update(subject: string, patch: MemoryPatch): Promise<MemorySettingsView>;
  deleteAll(subject: string): Promise<number>;
};
type Identity = ChatIdentity & { user: ChatIdentity["user"] & { isAnonymous?: boolean } };
type Dependencies = {
  identity: (request: Request) => Promise<Identity | null>;
  origin: () => string;
  consumeRequest: (subject: string) => Promise<void>;
  backend: () => MemoryBackend;
  log: (event: Record<string, unknown>) => void;
};
const MAX_BODY_BYTES = 4096;
export const memoryPatchSchema = z.strictObject({
  paused: z.boolean().optional(),
  instructions: z.string().max(MEMORY_LIMITS.instructionsCharacters).refine(value => value.isWellFormed()).nullable().optional(),
}).refine(patch => patch.paused !== undefined || patch.instructions !== undefined);
export type MemoryPatch = z.infer<typeof memoryPatchSchema>;

const headers = (requestId: string) => ({ "Cache-Control": "private, no-store", "X-Request-Id": requestId, "X-Content-Type-Options": "nosniff" });
function failure(error: unknown, requestId: string) {
  const code: PublicErrorCode = error instanceof AdmissionError ? error.code : "CONFIGURATION_UNAVAILABLE";
  const problem = createPublicError(code, requestId);
  return Response.json(problem.body, { status: problem.status, headers: headers(requestId) });
}

async function readPatch(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new AdmissionError("INVALID_INPUT");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new AdmissionError("INVALID_INPUT");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new AdmissionError("INVALID_INPUT"); }
  const parsed = memoryPatchSchema.safeParse(body);
  if (!parsed.success) throw new AdmissionError("INVALID_INPUT");
  return parsed.data;
}

export function createMemoryHttp(dependencies: Dependencies) {
  const log = (event: Record<string, unknown>) => { try { dependencies.log(event); } catch { /* Logging never affects a response. */ } };
  // Guests have no memory: it needs a real account to belong to.
  async function owner(request: Request) {
    const identity = await dependencies.identity(request);
    if (!identity || identity.user.isAnonymous) throw new AdmissionError("UNAUTHENTICATED");
    return identity.user.id;
  }
  async function changing(request: Request) {
    if (request.headers.get("origin") !== new URL(dependencies.origin()).origin) throw new AdmissionError("INVALID_ORIGIN");
    if (new URL(request.url).search) throw new AdmissionError("INVALID_INPUT");
    const subject = await owner(request);
    await dependencies.consumeRequest(subject);
    return subject;
  }
  return {
    async read(request: Request) {
      const requestId = crypto.randomUUID();
      try { return Response.json({ data: await dependencies.backend().settings(await owner(request)) }, { headers: headers(requestId) }); }
      catch (error) { return failure(error, requestId); }
    },
    async update(request: Request) {
      const requestId = crypto.randomUUID();
      try {
        const subject = await changing(request);
        const data = await dependencies.backend().update(subject, await readPatch(request));
        log({ event: "memory.settings", requestId, outcome: "UPDATED", paused: data.paused });
        return Response.json({ data }, { headers: headers(requestId) });
      } catch (error) { return failure(error, requestId); }
    },
    async deleteAll(request: Request) {
      const requestId = crypto.randomUUID();
      try {
        const deleted = await dependencies.backend().deleteAll(await changing(request));
        log({ event: "memory.delete_all", requestId, deleted });
        return Response.json({ data: { deleted } }, { headers: headers(requestId) });
      } catch (error) { return failure(error, requestId); }
    },
  };
}
