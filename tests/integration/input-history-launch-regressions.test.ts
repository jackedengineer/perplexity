import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { parseSafetyModel } from "@/server/ai/models";
import { createMessageAcceptance } from "@/server/runs/accept-message";
import { createRunAdmission } from "@/server/runs/admit";
import { FREE_ADMISSION_POLICY } from "@/server/runs/policy";
import { createInputGate } from "@/server/safety/input";
import { createOpenRouterSafetyProvider } from "@/server/safety/openrouter";
import type { SafetyInput } from "@/server/safety/provider";

const pg = new PGlite();
const db = drizzle(pg, { schema });
const keys = { activeKeyId: "test-v1", keys: { "test-v1": "a".repeat(64) } };
const policy = { ...FREE_ADMISSION_POLICY, operatorBudgetKey: "history-regression" };
let subject: string;
let conversationId: string;

beforeAll(async () => {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) {
    await pg.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
  }
});

beforeEach(async () => {
  await db.delete(schema.user);
  await db.delete(schema.operatorUsageBuckets);
  subject = randomUUID();
  await db.insert(schema.user).values({
    id: subject, name: "Synthetic", email: `${subject}@example.test`,
  });
  const [owner] = await db.insert(schema.appUsers).values({ authSubject: subject }).returning();
  const [conversation] = await db.insert(schema.conversations).values({
    userId: owner.id, creationRequestId: randomUUID(), creationFingerprint: "synthetic", title: "Test",
  }).returning();
  conversationId = conversation.id;
  for (const kind of ["PERIOD", "DAY"] as const) {
    const window = { startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000) };
    await db.insert(schema.usageBuckets).values({
      userId: owner.id, kind, ...window, entitlementVersion: "test-v1", creditLimit: 10, providerLimitMicroUsd: 100000n,
    });
    await db.insert(schema.operatorUsageBuckets).values({
      budgetKey: policy.operatorBudgetKey, kind, ...window, providerLimitMicroUsd: 100000n,
    });
  }
});
afterAll(() => pg.close());

async function history(texts: string[]) {
  await db.insert(schema.messages).values(texts.map((text, index) => ({
    conversationId, role: "USER" as const, kind: "QUESTION" as const, sequence: index + 1,
    policyVersion: "v1", approvedAt: new Date(), parts: [{ type: "text" as const, text }],
  })));
  await db.update(schema.conversations).set({ nextSequence: texts.length + 1 });
}

async function admit(text: string) {
  const request = {
    conversationId, clientRequestId: randomUUID(), expectedRevision: 0,
    mode: "FAST", modelKey: "fast-default", message: { text },
  };
  const admitted = await createRunAdmission(db, keys, policy).admit(subject, request);
  if (admitted.kind !== "ADMITTED") throw new Error("Synthetic admission failed");
  return { request, runId: admitted.run.id };
}

it("rejects combined original/history wire overflow before claiming a classifier attempt", async () => {
  await history(["界".repeat(4000)]);
  const { request, runId } = await admit("文".repeat(4000));
  const fetcher = vi.fn<typeof fetch>();
  const config = parseSafetyModel({
    OPENROUTER_API_KEY: "synthetic-test-key-only", MODEL_SAFETY: "test/classifier", SAFETY_OPENROUTER_PROVIDER: "test-provider",
  })!;
  const provider = createOpenRouterSafetyProvider(config, fetcher);
  const classify = vi.spyOn(provider, "classify");
  const result = await createMessageAcceptance(db, keys, createInputGate(provider))
    .accept(subject, runId, request, new AbortController().signal);

  expect(result).toMatchObject({ kind: "DENIED", code: "SAFETY_UNAVAILABLE" });
  // A local size failure must not begin the provider attempt and become an
  // uncertain billable call. Neither the original nor history may be truncated.
  expect(classify.mock.calls.length).toBe(0);
  expect(fetcher).not.toHaveBeenCalled();
  expect(await db.select().from(schema.messages)).toHaveLength(1);
});

it.each(["message-count", "character-count"])("does not approve a follow-up after %s limits silently drop older harmful intent", async (limit) => {
  const earlierIntent = "My goal is to deceive customers for financial gain.";
  const earlierTurns = limit === "message-count"
    ? [earlierIntent, ...Array.from({ length: 6 }, (_, index) => `Unrelated neutral discussion ${index}.`)]
    : [earlierIntent, "a".repeat(4000), "b".repeat(3000)];
  await history(earlierTurns);
  const { request, runId } = await admit("Give me the next steps.");
  const classify = vi.fn(async (input: SafetyInput) => ({
    decision: input.context.some(turn => turn.text === earlierIntent) ? "BLOCK" : "ALLOW",
    categoryCodes: input.context.some(turn => turn.text === earlierIntent) ? ["FRAUD"] : [],
    policyVersion: "v1",
  }));
  const provider = { modelId: "test/safety", classify };
  const result = await createMessageAcceptance(db, keys, createInputGate(provider))
    .accept(subject, runId, request, new AbortController().signal);

  // Either complete reclassification or a fail-closed history limit is safe;
  // reclassifying a silent tail-only slice and approving the continuation is not.
  expect(result.kind).toBe("DENIED");
  expect(await db.select().from(schema.messages)).toHaveLength(earlierTurns.length);
});
