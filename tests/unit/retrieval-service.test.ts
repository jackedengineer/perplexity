import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({ session: vi.fn(),db: vi.fn(),factory: vi.fn(),retrieve: vi.fn(),load: vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/current-session",()=>({ getCurrentSession: mocks.session }));
vi.mock("@/db",()=>({ getDb: mocks.db }));
vi.mock("@/server/search/retrieve",()=>({ createRetrieval: mocks.factory }));
import { retrieveAdmittedEvidence, loadPrivateEvidence } from "@/server/search/service";
afterEach(()=>{ vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
function configuration() {
  vi.stubEnv("OPENROUTER_API_KEY","test-key-abcdefghijklmnop"); vi.stubEnv("MODEL_SAFETY","test/safety");
  vi.stubEnv("SAFETY_OPENROUTER_PROVIDER","test"); vi.stubEnv("TAVILY_API_KEY","test-tavily-key-abcdefghijklmnop");
  mocks.session.mockResolvedValue({ user: { id: "verified-subject" } });
  mocks.factory.mockReturnValue({ retrieve: mocks.retrieve,load: mocks.load });
}
it("checks authentication before constructing DB or providers",async()=>{
  const log = vi.spyOn(console,"info").mockImplementation(()=>undefined); mocks.session.mockResolvedValue(null);
  expect(await retrieveAdmittedEvidence("run",new AbortController().signal)).toMatchObject({ kind: "DENIED",code: "UNAUTHENTICATED" });
  expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.factory).not.toHaveBeenCalled(); expect(JSON.stringify(log.mock.calls)).not.toContain("verified-subject");
});
it("requires both configured providers and does not spend when configuration is missing",async()=>{
  vi.spyOn(console,"info").mockImplementation(()=>undefined); configuration(); vi.stubEnv("TAVILY_API_KEY","");
  expect(await retrieveAdmittedEvidence("run",new AbortController().signal)).toMatchObject({ kind: "DENIED",code: "CONFIGURATION_UNAVAILABLE" });
  expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled();
});
it("uses only the verified subject and emits fixed diagnostic metadata",async()=>{
  const log = vi.spyOn(console,"info").mockImplementation(()=>undefined); configuration();
  mocks.retrieve.mockRejectedValue(new Error("PRIVATE SQL error and credentials")); const signal = new AbortController().signal;
  const result = await retrieveAdmittedEvidence("run-id",signal);
  expect(mocks.retrieve).toHaveBeenCalledWith("verified-subject","run-id",signal);
  expect(result).toMatchObject({ kind: "DENIED",code: "PROVIDER_UNAVAILABLE" });
  expect(JSON.stringify([result,log.mock.calls])).not.toMatch(/PRIVATE|verified-subject|credentials/);
  expect(log.mock.calls[0][0]).toContain('"event":"search.retrieval"');
});
it("keeps private evidence loading authenticated and independent of provider availability",async()=>{
  mocks.session.mockResolvedValue(null); expect(await loadPrivateEvidence("run")).toBeNull(); expect(mocks.db).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue({ user: { id: "verified-subject" } });
  mocks.factory.mockReturnValue({ load: mocks.load }); mocks.load.mockResolvedValue({ runId: "test",sources: [],passages: [] });
  expect(await loadPrivateEvidence("run")).toMatchObject({ runId: "test" });
  expect(mocks.load).toHaveBeenCalledWith("verified-subject","run");
});
