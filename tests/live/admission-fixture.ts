import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createRunAdmission } from "@/server/runs/admit";
import { FREE_ADMISSION_POLICY } from "@/server/runs/policy";

export function createNeonFixture() {
  // Explicit opt-in and isolated namespaces; never run this suite against production.
  const ownerUrl = new URL(process.env.DATABASE_URL_DIRECT ?? "http://missing");
  const runtimeUrl = new URL(process.env.DATABASE_URL ?? "http://missing");
  if (process.env.LIVE_NEON_ADMISSION !== "1" || !ownerUrl.hostname.endsWith(".neon.tech") ||
      ownerUrl.pathname !== "/perplex" || !ownerUrl.username.endsWith("_owner") || runtimeUrl.username !== "perplex_web" ||
      ownerUrl.searchParams.get("sslmode") !== "verify-full" || runtimeUrl.searchParams.get("sslmode") !== "verify-full" ||
      runtimeUrl.hostname.replace("-pooler", "") !== ownerUrl.hostname || runtimeUrl.pathname !== ownerUrl.pathname) {
    throw new Error("Explicit dedicated development Neon owner/runtime configuration required");
  }
  const ownerPool = new Pool({ connectionString: ownerUrl.toString(), max: 2, connectionTimeoutMillis: 5000, statement_timeout: 10_000 });
  const runtimePool = new Pool({ connectionString: runtimeUrl.toString(), max: 4, connectionTimeoutMillis: 5000, statement_timeout: 10_000 });
  const owner = drizzle(ownerPool, { schema }), runtime = drizzle(runtimePool, { schema });
  const subjects: string[] = [], namespace = `test-${randomUUID()}`;
  const keys = { activeKeyId: "test-v1", keys: { "test-v1": randomBytes(32).toString("hex") } };
  const policy = { ...FREE_ADMISSION_POLICY, operatorBudgetKey: namespace, attemptsPerMinute: 50, attemptsPerDay: 100 };
  const admission = createRunAdmission(runtime, keys, policy);
  const window = () => ({ startsAt: new Date(Date.now()-86_400_000), endsAt: new Date(Date.now()+86_400_000) });
  async function identity() {
    const subject = `admission-test-${randomUUID()}`;
    subjects.push(subject);
    await owner.insert(schema.user).values({ id: subject, name: "Synthetic admission test", email: `${subject}@example.test` });
    const [profile] = await owner.insert(schema.appUsers).values({ authSubject: subject }).returning();
    const [conversation] = await owner.insert(schema.conversations).values({ userId: profile.id,
      creationRequestId: randomUUID(), creationFingerprint: "synthetic", title: "Synthetic admission test" }).returning();
    await owner.insert(schema.usageBuckets).values((["PERIOD", "DAY"] as const).map((kind) => ({ userId: profile.id, kind,
      ...window(), entitlementVersion: "test-grant-v1", creditLimit: 10, providerLimitMicroUsd: 100_000n })));
    const request = { conversationId: conversation.id, clientRequestId: randomUUID(), expectedRevision: 0,
      mode: "FAST", modelKey: "fast-default", message: { text: "Synthetic admission concurrency check" } };
    return { subject, profile, conversation, request };
  }
  async function budgets(limit = 100_000n) {
    await owner.insert(schema.operatorUsageBuckets).values((["PERIOD", "DAY"] as const).map((kind) => ({
      budgetKey: namespace, kind, ...window(), providerLimitMicroUsd: limit })));
  }
  async function cleanup() {
    // Only captured synthetic IDs and this fixture's unique operator namespace.
    if (subjects.length) await owner.delete(schema.user).where(inArray(schema.user.id,subjects));
    await owner.delete(schema.operatorUsageBuckets).where(eq(schema.operatorUsageBuckets.budgetKey,namespace));
  }
  async function close() {
    try { await cleanup(); } finally { await Promise.all([ownerPool.end(), runtimePool.end()]); }
  }
  return { owner, runtime, ownerPool, runtimePool, namespace, keys, policy, admission, identity, budgets, cleanup, close };
}
export async function simultaneously<T>(work: (() => Promise<T>)[]) {
  let release!: () => void;
  const barrier = new Promise<void>((resolve)=>{ release = resolve; });
  const tasks = work.map(async (run) => { await barrier; return run(); });
  release();
  return Promise.all(tasks);
}
