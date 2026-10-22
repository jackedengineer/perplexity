import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createRunIntake } from "@/server/runs/intake";
import { parseAdmissionEnvironment } from "@/server/runs/env";

const payload = { conversationId: randomUUID(), clientRequestId: randomUUID(), expectedRevision: 0,
  mode: "FAST", modelKey: "fast-default", message: { text: "PRIVATE QUESTION" } };
const request = (body = payload) => new Request("http://localhost/api/chat", { method: "POST",
  headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) });
it("validates a session before reading input or invoking admission", async () => {
  const req = request(), log = vi.fn(), admit = vi.fn();
  const intake = createRunIntake({ identity: async () => null, origin: () => "http://localhost", admit, log });
  expect(await intake(req)).toMatchObject({ kind: "DENIED", code: "UNAUTHENTICATED" });
  expect(req.bodyUsed).toBe(false); expect(admit).not.toHaveBeenCalled();
  expect(log.mock.calls[0][0]).toMatchObject({ event: "runs.admission", outcome: "UNAUTHENTICATED" });
});
it("uses only the verified identity and logs safe timing/outcome metadata", async () => {
  const admit = vi.fn().mockResolvedValue({ kind: "DENIED", code: "BUDGET_EXCEEDED" }), log = vi.fn();
  const intake = createRunIntake({ identity: async () => ({ user: { id: "verified-subject" } }), origin: () => "http://localhost", admit, log });
  const result = await intake(request());
  expect(admit).toHaveBeenCalledWith("verified-subject", payload);
  expect(result).toMatchObject({ kind: "DENIED", code: "BUDGET_EXCEEDED" });
  expect(result.requestId).toMatch(/^[a-f0-9-]{36}$/u);
  expect(log.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE QUESTION|verified-subject/);
  admit.mockRejectedValue(new Error("driver SQL parameters PRIVATE QUESTION"));
  expect(await intake(request())).toMatchObject({ kind: "DENIED", code: "CONFIGURATION_UNAVAILABLE" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE QUESTION");
});
it("loads explicit key-ring configuration without returning malformed secrets", () => {
  const valid = { RUN_HMAC_ACTIVE_KEY_ID: "dev-v1", RUN_HMAC_KEYS_JSON: JSON.stringify({ "dev-v1": "c".repeat(64) }) };
  expect(parseAdmissionEnvironment(valid).activeKeyId).toBe("dev-v1");
  for (const env of [{}, { ...valid, RUN_HMAC_KEYS_JSON: "private-invalid-json" }]) {
    expect(() => parseAdmissionEnvironment(env)).toThrow("Admission configuration is unavailable.");
  }
});
