import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import * as schema from "@/db/schema";
const pg = new PGlite(), db = drizzle(pg,{ schema });
let runId: string, conversationId: string;
beforeAll(async () => {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));
  for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,"utf8"));
  await db.insert(schema.user).values({ id: "schema-test", name: "Synthetic", email: "schema@example.test" });
  const [profile] = await db.insert(schema.appUsers).values({ authSubject: "schema-test" }).returning();
  const [conversation] = await db.insert(schema.conversations).values({ userId: profile.id, creationRequestId: randomUUID(), creationFingerprint: "test", title: "Test" }).returning();
  conversationId = conversation.id;
  const [run] = await db.insert(schema.runs).values({ userId: profile.id, conversationId, clientRequestId: randomUUID(),
    payloadHmac: "a".repeat(64), hmacKeyId: "test-v1", catalogVersion: "test-v1", priceVersion: "test-v1", entitlementVersion: "test-v1",
    operatorBudgetKey: "test", answerCredits: 5, providerReserveMicroUsd: 50_000n, admittedRevision: 1, deadlineAt: new Date(Date.now()+45000) }).returning();
  runId = run.id;
});
afterAll(()=>pg.close());
const review = () => ({ runId, conversationId, attemptVersion: 1, decision: "BLOCK" as const, categoryCodes: ["FRAUD"],
  reason: "CLASSIFIER" as const, detectorVersion: "input-v1", policyVersion: "v1", durationMs: 1 });
it("rejects contradictory review metadata, unknown categories and cross-conversation references", async () => {
  for (const invalid of [{ categoryCodes: [] },{ categoryCodes: ["UNKNOWN"] },{ categoryCodes: [null] },{ durationMs: -1 },
    { acceptedMessageId: randomUUID() },{ conversationId: randomUUID() },{ decision: "ALLOW", categoryCodes: [] }]) {
    await expect(db.insert(schema.inputSafetyReviews).values({ ...review(), ...invalid } as typeof schema.inputSafetyReviews.$inferInsert)).rejects.toThrow();
  }
});
it("allows runtime question writes only through a matching ALLOW review and keeps assistants blocked", async () => {
  await pg.exec("CREATE ROLE input_gate_writer_test; GRANT USAGE ON SCHEMA public TO input_gate_writer_test; GRANT SELECT ON output_safety_reviews TO input_gate_writer_test; GRANT SELECT,INSERT ON messages,input_safety_reviews TO input_gate_writer_test");
  const base = { conversationId,sequence: 1,policyVersion: "v1",approvedAt: new Date(),parts: [{ type: "text" as const,text: "Synthetic RLS check" }] };
  await pg.exec("SET ROLE input_gate_writer_test");
  try {
    for (const row of [{ role: "ASSISTANT",kind: "ANSWER" },{ role: "USER",kind: "QUESTION" },{ role: "USER",kind: "QUESTION",approvedAt: null }] as const) {
      await expect(db.insert(schema.messages).values({ ...base,...row })).rejects.toMatchObject({ cause: { code: "42501" } });
    }
  } finally { await pg.exec("RESET ROLE"); }
  const messageId = randomUUID();
  await db.transaction(async(tx)=>{
    await tx.insert(schema.inputSafetyReviews).values({ ...review(),decision: "ALLOW",categoryCodes: [],acceptedMessageId: messageId });
    await tx.execute(sql`SET LOCAL ROLE input_gate_writer_test`);
    await tx.insert(schema.messages).values({ ...base,id: messageId,role: "USER",kind: "QUESTION" });
  });
  expect(await db.select().from(schema.messages)).toHaveLength(1);
  await db.delete(schema.messages); // Owner fixture cleanup cascades its synthetic review.
});
it("records one content-free decision per run and deletes it with the owned run", async () => {
  await db.insert(schema.inputSafetyReviews).values(review());
  await expect(db.insert(schema.inputSafetyReviews).values(review())).rejects.toThrow();
  expect(await db.select().from(schema.inputSafetyReviews)).toHaveLength(1);
  await db.delete(schema.user);
  expect(await db.select().from(schema.inputSafetyReviews)).toHaveLength(0);
});
