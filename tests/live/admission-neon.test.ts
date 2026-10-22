import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createRunAdmission } from "@/server/runs/admit";
import { createNeonFixture, simultaneously } from "./admission-fixture";

const f = createNeonFixture();
afterEach(() => f.cleanup());
afterAll(() => f.close());
beforeAll(async () => {
  // Hold transactions simultaneously: a transaction pooler cannot reuse one backend.
  const clients = await Promise.all(Array.from({ length: 4 },()=>f.runtimePool.connect()));
  try {
    await Promise.all(clients.map((client)=>client.query("BEGIN")));
    const backends = await Promise.all(clients.map(async (client)=>(await client.query("SELECT pg_backend_pid() AS id")).rows[0].id));
    expect(new Set(backends).size).toBe(4);
  } finally {
    await Promise.all(clients.map(async (client)=>{ try { await client.query("ROLLBACK"); } finally { client.release(); } }));
  }
});
it("identical concurrent intents on independent connections create exactly one run and hold", async () => {
  const person = await f.identity(); await f.budgets();
  const outcomes = await simultaneously(Array.from({ length: 4 },()=>()=>f.admission.admit(person.subject,person.request)));
  expect(outcomes.filter((r)=>r.kind === "ADMITTED")).toHaveLength(1);
  expect(outcomes.filter((r)=>r.kind === "RUN_IN_PROGRESS")).toHaveLength(3);
  expect(new Set(outcomes.flatMap((r)=>"run" in r ? [r.run.id] : [] )).size).toBe(1);
  const runs = await f.owner.select().from(schema.runs).where(eq(schema.runs.userId,person.profile.id));
  expect(runs).toHaveLength(1);
  expect(await f.owner.select().from(schema.usageReservations).where(eq(schema.usageReservations.runId,runs[0].id))).toHaveLength(1);
  const user = await f.owner.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,person.profile.id));
  expect(user.map((r)=>r.reservedCredits)).toEqual([5,5]);
  expect(user.map((r)=>r.reservedProviderMicroUsd)).toEqual([50_000n,50_000n]);
  const attempts = await f.owner.select().from(schema.admissionAttemptBuckets).where(eq(schema.admissionAttemptBuckets.userId,person.profile.id));
  expect(attempts.map((r)=>r.attempts)).toEqual([1,1]);
});
it("different payloads sharing an intent cannot race into two paid attempts", async () => {
  const person = await f.identity(); await f.budgets();
  const other = { ...person.request, message: { text: "Different synthetic question" } };
  const outcomes = await simultaneously([()=>f.admission.admit(person.subject,person.request),()=>f.admission.admit(person.subject,other)]);
  expect(outcomes.filter((r)=>r.kind === "ADMITTED")).toHaveLength(1);
  expect(outcomes).toContainEqual({ kind: "DENIED", code: "IDEMPOTENCY_MISMATCH" });
  expect(await f.owner.select().from(schema.runs).where(eq(schema.runs.userId,person.profile.id))).toHaveLength(1);
});
it("different users competing for the last operator budget cannot overspend", async () => {
  const people = await Promise.all([f.identity(),f.identity()]); await f.budgets(50_000n);
  const outcomes = await simultaneously(people.map((person)=>()=>f.admission.admit(person.subject,person.request)));
  expect(outcomes.filter((r)=>r.kind === "ADMITTED")).toHaveLength(1);
  expect(outcomes).toContainEqual({ kind: "DENIED", code: "BUDGET_EXCEEDED" });
  const operators = await f.owner.select().from(schema.operatorUsageBuckets).where(eq(schema.operatorUsageBuckets.budgetKey,f.namespace));
  expect(operators.map((r)=>r.reservedProviderMicroUsd)).toEqual([50_000n,50_000n]);
  const admitted = outcomes.findIndex((r)=>r.kind === "ADMITTED");
  for (const [index, person] of people.entries()) {
    const users = await f.owner.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,person.profile.id));
    expect(users.map((r)=>r.reservedCredits)).toEqual(index === admitted ? [5,5] : [0,0]);
    const [conversation] = await f.owner.select().from(schema.conversations).where(eq(schema.conversations.id,person.conversation.id));
    expect(conversation.revision).toBe(index === admitted ? 1 : 0);
  }
});
it("different intents across owned conversations still enforce one active run per owner", async () => {
  const person = await f.identity(); await f.budgets();
  const [other] = await f.owner.insert(schema.conversations).values({ userId: person.profile.id,
    creationRequestId: randomUUID(), creationFingerprint: "synthetic", title: "Second synthetic conversation" }).returning();
  const requests = [person.request,{ ...person.request, conversationId: other.id, clientRequestId: randomUUID() }];
  const outcomes = await simultaneously(requests.map((request)=>()=>f.admission.admit(person.subject,request)));
  expect(outcomes.filter((r)=>r.kind === "ADMITTED")).toHaveLength(1);
  expect(outcomes).toContainEqual({ kind: "DENIED", code: "RUN_IN_PROGRESS" });
  const users = await f.owner.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,person.profile.id));
  expect(users.map((r)=>r.reservedCredits)).toEqual([5,5]);
});
it("a depleted operator day rolls back all user/period holds under the restricted runtime role", async () => {
  const person = await f.identity(); await f.budgets();
  await f.owner.update(schema.operatorUsageBuckets).set({ providerLimitMicroUsd: 1n })
    .where(and(eq(schema.operatorUsageBuckets.budgetKey,f.namespace),eq(schema.operatorUsageBuckets.kind,"DAY")));
  expect(await f.admission.admit(person.subject,person.request)).toEqual({ kind: "DENIED", code: "BUDGET_EXCEEDED" });
  const users = await f.owner.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,person.profile.id));
  const operators = await f.owner.select().from(schema.operatorUsageBuckets).where(eq(schema.operatorUsageBuckets.budgetKey,f.namespace));
  expect(users.map((r)=>r.reservedCredits)).toEqual([0,0]);
  expect(operators.map((r)=>r.reservedProviderMicroUsd)).toEqual([0n,0n]);
  expect(await f.owner.select().from(schema.runs).where(eq(schema.runs.userId,person.profile.id))).toHaveLength(0);
});
it("terminal replay survives configuration rotation without changing its original held amounts", async () => {
  const person = await f.identity(); await f.budgets();
  const first = await f.admission.admit(person.subject,person.request);
  expect(first.kind).toBe("ADMITTED");
  await f.owner.update(schema.runs).set({ status: "TIMED_OUT" }).where(eq(schema.runs.userId,person.profile.id));
  const updated = createRunAdmission(f.runtime,f.keys,{ ...f.policy, priceVersion: "test-price-v2", answerCredits: 10 });
  expect(await updated.admit(person.subject,person.request)).toMatchObject({ kind: "RUN_ALREADY_FINISHED" });
  const users = await f.owner.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,person.profile.id));
  expect(users.map((r)=>r.reservedCredits)).toEqual([5,5]);
  expect(await f.owner.select().from(schema.usageReservations).where(inArray(schema.usageReservations.periodBucketId,users.map((r)=>r.id)))).toHaveLength(1);
});
