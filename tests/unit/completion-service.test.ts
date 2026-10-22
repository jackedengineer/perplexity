import { afterEach,expect,it,vi } from "vitest";
const mocks = vi.hoisted(()=>({ session: vi.fn(),db: vi.fn(),factory: vi.fn(),complete: vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/current-session",()=>({ getCurrentSession: mocks.session }));
vi.mock("@/db",()=>({ getDb: mocks.db }));
vi.mock("@/server/runs/complete",()=>({ createAnswerCompletion: mocks.factory }));
import { completeAdmittedAnswer } from "@/server/runs/completion-service";
afterEach(()=>{ vi.restoreAllMocks();vi.resetAllMocks();vi.unstubAllEnvs(); });
function configure() {
  vi.stubEnv("OPENROUTER_API_KEY","synthetic-test-key-only");vi.stubEnv("MODEL_SAFETY","test/safety");vi.stubEnv("SAFETY_OPENROUTER_PROVIDER","test");
  vi.stubEnv("MODEL_ANSWER","test/answer");vi.stubEnv("ANSWER_OPENROUTER_PROVIDER","test");
  mocks.session.mockResolvedValue({ user: { id: "verified-subject" },sessionId: "verified-session" });
  mocks.factory.mockReturnValue({ complete: mocks.complete });
}
it("checks auth before DB/provider construction",async()=>{
  vi.spyOn(console,"info").mockImplementation(()=>undefined);mocks.session.mockResolvedValue(null);
  expect(await completeAdmittedAnswer("run",new AbortController().signal)).toMatchObject({ kind: "DENIED",code: "UNAUTHENTICATED" });
  expect(mocks.db).not.toHaveBeenCalled();expect(mocks.factory).not.toHaveBeenCalled();
});
it("requires explicit answer and output models before any private execution",async()=>{
  vi.spyOn(console,"info").mockImplementation(()=>undefined);configure();vi.stubEnv("MODEL_ANSWER","");
  expect(await completeAdmittedAnswer("run",new AbortController().signal)).toMatchObject({ kind: "DENIED",code: "CONFIGURATION_UNAVAILABLE" });
  expect(mocks.complete).not.toHaveBeenCalled();expect(mocks.db).not.toHaveBeenCalled();
});
it("uses the verified subject/session and never logs raw driver/model failure",async()=>{
  const log = vi.spyOn(console,"info").mockImplementation(()=>undefined);configure();mocks.complete.mockRejectedValue(new Error("PRIVATE draft and credentials"));
  const signal = new AbortController().signal,result = await completeAdmittedAnswer("run",signal);
  expect(mocks.complete).toHaveBeenCalledWith("verified-subject","verified-session","run",signal);
  expect(result).toMatchObject({ kind: "DENIED",code: "PROVIDER_UNAVAILABLE" });
  expect(JSON.stringify([result,log.mock.calls])).not.toMatch(/PRIVATE|verified-session|verified-subject/);
});
