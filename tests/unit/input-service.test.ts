import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({ session: vi.fn(),db: vi.fn(),factory: vi.fn(),accept: vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/current-session",()=>({ getCurrentSession: mocks.session }));
vi.mock("@/db",()=>({ getDb: mocks.db }));
vi.mock("@/server/runs/accept-message",()=>({ createMessageAcceptance: mocks.factory }));
import { checkAdmittedInput } from "@/server/safety/service";
afterEach(()=>{ vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("authenticates before creating any database/provider acceptance service", async()=>{
  const log = vi.spyOn(console,"info").mockImplementation(()=>undefined);
  mocks.session.mockResolvedValue(null);
  expect(await checkAdmittedInput("run","PRIVATE question",new AbortController().signal)).toMatchObject({ kind: "DENIED",code: "UNAUTHENTICATED" });
  expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.factory).not.toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
});
it("uses the verified subject and returns only a fixed unavailable result on driver failure", async()=>{
  const log = vi.spyOn(console,"info").mockImplementation(()=>undefined);
  vi.stubEnv("RUN_HMAC_ACTIVE_KEY_ID","test-v1"); vi.stubEnv("RUN_HMAC_KEYS_JSON",JSON.stringify({ "test-v1": "c".repeat(64) }));
  mocks.session.mockResolvedValue({ user: { id: "verified-subject" } });
  mocks.factory.mockReturnValue({ accept: mocks.accept });
  mocks.accept.mockRejectedValue(new Error("PRIVATE SQL parameters and credentials"));
  const signal = new AbortController().signal;
  const result = await checkAdmittedInput("run-id",{ message: "PRIVATE question" },signal);
  expect(result).toMatchObject({ kind: "DENIED",code: "SAFETY_UNAVAILABLE" });
  expect(mocks.accept).toHaveBeenCalledWith("verified-subject","run-id",{ message: "PRIVATE question" },signal);
  expect(JSON.stringify([result,log.mock.calls])).not.toMatch(/PRIVATE|verified-subject|credentials/);
  expect(log.mock.calls[0][0]).toContain('"event":"safety.input"');
});
