import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createRunAdmission } from "@/server/runs/admit";
import { FREE_ADMISSION_POLICY } from "@/server/runs/policy";
import { createConversationRepository } from "@/server/conversations/repository";
import { AdmissionError } from "@/server/runs/errors";

const pg = new PGlite(), db = drizzle(pg, { schema });
const keys = { activeKeyId: "test-v1", keys: { "test-v1": "a".repeat(64) } };
const policy = { ...FREE_ADMISSION_POLICY, operatorBudgetKey: "admission-tests", attemptsPerMinute: 50, attemptsPerDay: 100 };
const admission = createRunAdmission(db, keys, policy);
const conversations = createConversationRepository(db);
let id: string;
beforeAll(async () => {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
  await db.insert(schema.user).values(["alice", "bob"].map((id) => ({ id, name: id, email: `${id}@example.test` })));
});
beforeEach(async () => {
  await db.delete(schema.appUsers); await db.delete(schema.operatorUsageBuckets);
  id = (await conversations.create("alice", { clientRequestId: randomUUID(), title: "Private research" })).conversation.id;
  const [{ userId }] = await db.select({ userId: schema.conversations.userId }).from(schema.conversations).where(eq(schema.conversations.id,id));
  for (const kind of ["PERIOD", "DAY"] as const) {
    const startsAt = new Date(Date.now()-86_400_000), endsAt = new Date(Date.now()+86_400_000);
    await db.insert(schema.usageBuckets).values({ userId, kind, startsAt, endsAt, entitlementVersion: "grant-v1", creditLimit: 10, providerLimitMicroUsd: 100_000n });
    await db.insert(schema.operatorUsageBuckets).values({ budgetKey: policy.operatorBudgetKey, kind, startsAt, endsAt, providerLimitMicroUsd: 100_000n });
  }
});
afterAll(() => pg.close());
const input = (extra = {}) => ({ conversationId: id, clientRequestId: randomUUID(), expectedRevision: 0, mode: "FAST", modelKey: "fast-default", message: { text: "RAW_QUESTION_MUST_NOT_BE_PERSISTED" }, ...extra });

it("checks provider availability only for new work, before attempts and holds",async()=>{
  const unavailable=createRunAdmission(db,keys,policy,()=>{throw new AdmissionError("CONFIGURATION_UNAVAILABLE");});
  const request=input();
  expect(await unavailable.admit("alice",request)).toEqual({kind:"DENIED",code:"CONFIGURATION_UNAVAILABLE"});
  expect(await db.select().from(schema.runs)).toHaveLength(0);
  expect(await db.select().from(schema.admissionAttemptBuckets)).toHaveLength(0);
  expect((await db.select().from(schema.usageBuckets)).map(row=>row.reservedCredits)).toEqual([0,0]);
  expect((await admission.admit("alice",request)).kind).toBe("ADMITTED");
  expect((await unavailable.admit("alice",request)).kind).toBe("RUN_IN_PROGRESS");
  await db.update(schema.runs).set({status:"TIMED_OUT"});
  expect((await unavailable.admit("alice",request)).kind).toBe("RUN_ALREADY_FINISHED");
});

it("commits one run and four bounded holds without storing the question or messages", async () => {
  const result = await admission.admit("alice", input());
  expect(result.kind).toBe("ADMITTED");
  const [run] = await db.select().from(schema.runs);
  expect(run.admittedRevision).toBe(1);
  expect(JSON.stringify(run, (_,value)=>typeof value === "bigint" ? value.toString() : value)).not.toContain("RAW_QUESTION");
  expect(await db.select().from(schema.usageReservations)).toHaveLength(1);
  for (const bucket of await db.select().from(schema.usageBuckets)) {
    expect(bucket.reservedCredits).toBe(5); expect(bucket.reservedProviderMicroUsd).toBe(50_000n);
  }
  for (const bucket of await db.select().from(schema.operatorUsageBuckets)) expect(bucket.reservedProviderMicroUsd).toBe(50_000n);
  expect(await db.select().from(schema.messages)).toHaveLength(0);
});
it("replays running/terminal intents with their original snapshot and historical HMAC key", async () => {
  const request = input();
  const first = await admission.admit("alice", request);
  expect(await admission.admit("alice", request)).toMatchObject({ kind: "RUN_IN_PROGRESS", run: first.kind === "ADMITTED" ? first.run : undefined });
  expect(await admission.admit("alice", { ...request, message: { text: "changed" } })).toEqual({ kind: "DENIED", code: "IDEMPOTENCY_MISMATCH" });
  await db.update(schema.runs).set({ status: "TIMED_OUT" });
  const rotated = createRunAdmission(db, { activeKeyId: "test-v2", keys: { ...keys.keys, "test-v2": "b".repeat(64) } }, { ...policy, priceVersion: "price-v2", answerCredits: 10 });
  expect(await rotated.admit("alice", request)).toMatchObject({ kind: "RUN_ALREADY_FINISHED" });
  expect((await db.select().from(schema.admissionAttemptBuckets)).map((r)=>r.attempts)).toEqual([1,1]);
  expect(await db.select().from(schema.usageReservations)).toHaveLength(1);
});
it("rejects foreign IDs, stale revisions and competing runs without extra reservations", async () => {
  expect(await admission.admit("bob", input())).toEqual({ kind: "DENIED", code: "NOT_FOUND" });
  expect(await admission.admit("alice", input({ expectedRevision: 2 }))).toEqual({ kind: "DENIED", code: "CONFLICT" });
  expect((await admission.admit("alice", input())).kind).toBe("ADMITTED");
  const other = (await conversations.create("alice", { clientRequestId: randomUUID(), title: "Other owned conversation" })).conversation.id;
  expect(await admission.admit("alice", input({ conversationId: other }))).toEqual({ kind: "DENIED", code: "RUN_IN_PROGRESS" });
  expect(await db.select().from(schema.usageReservations)).toHaveLength(1);
});
it("counts new denied attempts while rolling back every run and budget mutation", async () => {
  await db.update(schema.operatorUsageBuckets).set({ providerLimitMicroUsd: 1n }).where(eq(schema.operatorUsageBuckets.kind,"DAY"));
  expect(await admission.admit("alice", input())).toEqual({ kind: "DENIED", code: "BUDGET_EXCEEDED" });
  expect(await db.select().from(schema.runs)).toHaveLength(0);
  expect(await db.select().from(schema.usageReservations)).toHaveLength(0);
  expect((await db.select().from(schema.usageBuckets)).map((r)=>r.reservedCredits)).toEqual([0,0]);
  expect((await db.select().from(schema.admissionAttemptBuckets)).map((r)=>r.attempts)).toEqual([1,1]);
  expect((await conversations.get("alice", id)).revision).toBe(0);
});
it("fails closed for missing or overlapping funding and enforces submission rate limits", async () => {
  const limited = createRunAdmission(db, keys, { ...policy, attemptsPerMinute: 1 });
  await db.delete(schema.usageBuckets);
  expect(await limited.admit("alice", input())).toEqual({ kind: "DENIED", code: "BUDGET_EXCEEDED" });
  expect(await limited.admit("alice", input())).toEqual({ kind: "DENIED", code: "RATE_LIMITED" });
  expect(await db.select().from(schema.runs)).toHaveLength(0);
});
it("rolls back partial holds and the run when a late reservation constraint fails", async () => {
  await pg.exec(`CREATE FUNCTION reject_test_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
    CREATE TRIGGER reject_test_reservation BEFORE INSERT ON usage_reservations FOR EACH ROW EXECUTE FUNCTION reject_test_reservation()`);
  try {
    await expect(admission.admit("alice", input())).rejects.toMatchObject({ cause: { message: "synthetic failure" } });
    expect(await db.select().from(schema.runs)).toHaveLength(0);
    expect((await db.select().from(schema.usageBuckets)).map((r)=>r.reservedCredits)).toEqual([0,0]);
    expect((await db.select().from(schema.operatorUsageBuckets)).map((r)=>r.reservedProviderMicroUsd)).toEqual([0n,0n]);
    expect((await conversations.get("alice", id)).revision).toBe(0);
    expect(await db.select().from(schema.admissionAttemptBuckets)).toHaveLength(0);
  } finally { await pg.exec("DROP TRIGGER reject_test_reservation ON usage_reservations; DROP FUNCTION reject_test_reservation()"); }
});
it.each(["PERIOD", "DAY"] as const)("enforces independent %s customer-credit and provider-spend ceilings", async (kind) => {
  await db.update(schema.usageBuckets).set({ settledCredits: 6 }).where(eq(schema.usageBuckets.kind,kind));
  expect(await admission.admit("alice", input())).toEqual({ kind: "DENIED", code: "BUDGET_EXCEEDED" });
  await db.update(schema.usageBuckets).set({ settledCredits: 0, settledProviderMicroUsd: 50_001n }).where(eq(schema.usageBuckets.kind,kind));
  expect(await admission.admit("alice", input())).toEqual({ kind: "DENIED", code: "BUDGET_EXCEEDED" });
  expect((await db.select().from(schema.usageBuckets)).map((r)=>r.reservedCredits)).toEqual([0,0]);
  expect((await db.select().from(schema.operatorUsageBuckets)).map((r)=>r.reservedProviderMicroUsd)).toEqual([0n,0n]);
});
it("rejects missing operator configuration and overlapping user windows", async () => {
  await db.delete(schema.operatorUsageBuckets).where(eq(schema.operatorUsageBuckets.kind,"DAY"));
  expect(await admission.admit("alice", input())).toEqual({ kind: "DENIED", code: "CONFIGURATION_UNAVAILABLE" });
  const [bucket] = await db.select().from(schema.usageBuckets);
  await db.insert(schema.usageBuckets).values({ ...bucket, id: randomUUID(), startsAt: new Date(bucket.startsAt.getTime()+1) });
  expect(await admission.admit("alice", input())).toEqual({ kind: "DENIED", code: "CONFIGURATION_UNAVAILABLE" });
  expect(await db.select().from(schema.runs)).toHaveLength(0);
});
it("keeps an expired active intent held and fails closed when its historical key is missing", async () => {
  const request = input();
  await admission.admit("alice", request);
  await db.update(schema.runs).set({ createdAt: new Date(Date.now()-120_000), deadlineAt: new Date(Date.now()-60_000) });
  const [before]=await db.select().from(schema.runs);
  const retry=await admission.admit("alice", request);
  expect(retry).toMatchObject({ kind: "RUN_IN_PROGRESS",run:{deadlineAt:before.deadlineAt.toISOString()} });
  expect((await db.select().from(schema.runs))[0].deadlineAt).toEqual(before.deadlineAt);
  const rotated = createRunAdmission(db, { activeKeyId: "test-v2", keys: { "test-v2": "b".repeat(64) } }, policy);
  await expect(rotated.admit("alice", request)).rejects.toMatchObject({ code: "CONFIGURATION_UNAVAILABLE" });
  expect((await db.select().from(schema.usageBuckets)).map((r)=>r.reservedCredits)).toEqual([5,5]);
  expect(await db.select().from(schema.usageReservations)).toHaveLength(1);
});
it("accepts the exact remaining credit/spend balance and replays after funding expires", async () => {
  await db.update(schema.usageBuckets).set({ creditLimit: 5, providerLimitMicroUsd: 50_000n });
  await db.update(schema.operatorUsageBuckets).set({ providerLimitMicroUsd: 50_000n });
  const request = input();
  expect((await admission.admit("alice", request)).kind).toBe("ADMITTED");
  await db.update(schema.usageBuckets).set({ startsAt: new Date(Date.now()-120_000), endsAt: new Date(Date.now()-60_000) });
  expect((await admission.admit("alice", request)).kind).toBe("RUN_IN_PROGRESS");
  const other = (await conversations.create("alice", { clientRequestId: randomUUID(), title: "Other" })).conversation.id;
  expect(await admission.admit("alice", { ...request, conversationId: other })).toEqual({ kind: "DENIED", code: "IDEMPOTENCY_MISMATCH" });
});
it("caps daily attempt counts even when the minute limit permits another denial", async () => {
  const limited = createRunAdmission(db, keys, { ...policy, attemptsPerDay: 1 });
  await db.delete(schema.usageBuckets);
  expect(await limited.admit("alice", input())).toEqual({ kind: "DENIED", code: "BUDGET_EXCEEDED" });
  expect(await limited.admit("alice", input())).toEqual({ kind: "DENIED", code: "RATE_LIMITED" });
  expect((await db.select().from(schema.admissionAttemptBuckets).where(eq(schema.admissionAttemptBuckets.kind,"DAY")))[0].attempts).toBe(1);
});
it.each(["user-overlap", "operator-overlap", "entitlement-mismatch"] as const)("rejects %s independently of other funding errors", async (problem) => {
  if (problem === "user-overlap") {
    const [bucket] = await db.select().from(schema.usageBuckets);
    await db.insert(schema.usageBuckets).values({ ...bucket, id: randomUUID(), startsAt: new Date(bucket.startsAt.getTime()+1) });
  } else if (problem === "operator-overlap") {
    const [bucket] = await db.select().from(schema.operatorUsageBuckets);
    await db.insert(schema.operatorUsageBuckets).values({ ...bucket, id: randomUUID(), startsAt: new Date(bucket.startsAt.getTime()+1) });
  } else {
    await db.update(schema.usageBuckets).set({ entitlementVersion: "different-grant" }).where(eq(schema.usageBuckets.kind,"DAY"));
  }
  expect(await admission.admit("alice", input())).toEqual({ kind: "DENIED", code: "CONFIGURATION_UNAVAILABLE" });
  expect(await db.select().from(schema.runs)).toHaveLength(0);
  expect((await db.select().from(schema.usageBuckets)).every((r)=>r.reservedCredits === 0)).toBe(true);
});
