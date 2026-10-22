import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fingerprintSubmission, matchesFingerprint, parseAdmissionConfig, FREE_ADMISSION_POLICY } from "@/server/runs/policy";
import { readSubmission } from "@/server/runs/input";
import { getAttemptWindows } from "@/server/runs/windows";

const payload = { conversationId: randomUUID(), clientRequestId: randomUUID(), expectedRevision: 0,
  mode: "FAST", modelKey: "fast-default", message: { text: "  Preserve my question 🌈\nexactly. " } };
const keys = { activeKeyId: "test-v1", keys: { "test-v1": "a".repeat(64) } };
const snapshot = { ...FREE_ADMISSION_POLICY, entitlementVersion: "grant-v1" };
it("canonicalizes field order and UUID casing without rewriting original text", () => {
  const first = fingerprintSubmission(payload, snapshot, keys);
  expect(fingerprintSubmission({ ...payload, conversationId: payload.conversationId.toUpperCase(), message: { text: payload.message.text } }, snapshot, keys)).toEqual(first);
  expect(first.hmac).toMatch(/^[a-f0-9]{64}$/u);
  expect(JSON.stringify(first)).not.toContain(payload.message.text);
  for (const change of [{ message: { text: payload.message.text.trim() } }, { expectedRevision: 1 }, { locale: "hi-IN" }, { modelKey: "provider/model" }]) {
    if ("modelKey" in change) expect(() => fingerprintSubmission({ ...payload, ...change }, snapshot, keys)).toThrow();
    else expect(fingerprintSubmission({ ...payload, ...change }, snapshot, keys).hmac).not.toBe(first.hmac);
  }
  expect(fingerprintSubmission(payload, { ...snapshot, priceVersion: "price-v2" }, keys).hmac).not.toBe(first.hmac);
});
it("retains historical keys for retry comparison and rejects missing or malformed keys safely", () => {
  const first = fingerprintSubmission(payload, snapshot, keys);
  const rotated = { activeKeyId: "test-v2", keys: { ...keys.keys, "test-v2": "b".repeat(64) } };
  expect(matchesFingerprint(payload, snapshot, first, rotated)).toBe(true);
  expect(matchesFingerprint({ ...payload, message: { text: "different" } }, snapshot, first, rotated)).toBe(false);
  expect(() => matchesFingerprint(payload, snapshot, first, { ...rotated, keys: { "test-v2": "b".repeat(64) } })).toThrow("Admission configuration is unavailable.");
  for (const input of [{}, { activeKeyId: "unknown", keys: keys.keys }, { ...keys, keys: { "test-v1": "short-private-value" } }]) {
    expect(() => parseAdmissionConfig(input)).toThrow("Admission configuration is unavailable.");
  }
});
it("represents minute and Asia/Kolkata day boundaries in UTC", () => {
  const before = getAttemptWindows(new Date("2026-10-22T18:29:59.999Z"));
  const after = getAttemptWindows(new Date("2026-10-22T18:30:00.000Z"));
  expect(before[0].startsAt.toISOString()).toBe("2026-10-22T18:29:00.000Z");
  expect(before[1].startsAt.toISOString()).toBe("2026-10-21T18:30:00.000Z");
  expect(after[1].startsAt.toISOString()).toBe("2026-10-22T18:30:00.000Z");
});
function request(body: BodyInit, headers: Record<string,string> = {}) {
  return new Request("http://localhost/api/chat", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", ...headers }, body, duplex: "half" } as RequestInit);
}
it("reads capped JSON while preserving original text and rejecting forged fields", async () => {
  expect((await readSubmission(request(JSON.stringify(payload)), "http://localhost")).message.text).toBe(payload.message.text);
  for (const [body, headers, code] of [
    [JSON.stringify(payload), { origin: "https://evil.example" }, "INVALID_ORIGIN"],
    [JSON.stringify(payload), { "content-type": "text/plain" }, "UNSUPPORTED_MEDIA_TYPE"],
    ["{bad", {}, "MALFORMED_JSON"], [JSON.stringify({ ...payload, userId: randomUUID() }), {}, "INVALID_INPUT"],
    [JSON.stringify(payload), { "content-length": "99999" }, "TOO_LARGE"],
  ] as const) await expect(readSubmission(request(body, headers), "http://localhost")).rejects.toMatchObject({ code });
});
it("caps actual streamed bytes even without Content-Length and cancels an oversized stream", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(16_385)); }, cancel() { cancelled = true; } });
  await expect(readSubmission(request(stream), "http://localhost")).rejects.toMatchObject({ code: "TOO_LARGE" });
  expect(cancelled).toBe(true);
  const invalidUtf8 = new Uint8Array([0xff]);
  await expect(readSubmission(request(invalidUtf8), "http://localhost")).rejects.toMatchObject({ code: "MALFORMED_JSON" });
});
it("does not wait on uncooperative stream cancellation after hitting the byte cap", async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(16_385)); }, cancel() { return new Promise<void>(()=>undefined); } });
  await expect(readSubmission(request(stream), "http://localhost")).rejects.toMatchObject({ code: "TOO_LARGE" });
}, 1_000);
it("cancels an aborted request body without returning its abort reason", async () => {
  const controller = new AbortController();
  const stream = new ReadableStream<Uint8Array>({});
  const req = new Request("http://localhost/api/chat", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: stream, signal: controller.signal, duplex: "half" } as RequestInit);
  const reading = readSubmission(req,"http://localhost"); controller.abort("private reason");
  await expect(reading).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
});
