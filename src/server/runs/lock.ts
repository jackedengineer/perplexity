import { and, eq, sql } from "drizzle-orm";
import { appUsers, conversations, runs } from "@/db/schema";
import { AdmissionError } from "./errors";
import type { AdmissionTransaction } from "./usage";

export async function lockOwnedRun(tx: AdmissionTransaction, subject: string, runId: string) {
  await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
  const [owner] = await tx.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.authSubject,subject));
  if (!owner) throw new AdmissionError("NOT_FOUND");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'run-admission:'+owner.id}::text,0))`);
  const [candidate] = await tx.select({ conversationId: runs.conversationId }).from(runs).where(and(eq(runs.id,runId),eq(runs.userId,owner.id)));
  if (!candidate) throw new AdmissionError("NOT_FOUND");
  const [conversation] = await tx.select().from(conversations).where(and(eq(conversations.id,candidate.conversationId),eq(conversations.userId,owner.id))).for("update");
  const [run] = await tx.select().from(runs).where(and(eq(runs.id,runId),eq(runs.userId,owner.id))).for("update");
  if (!conversation || !run) throw new AdmissionError("NOT_FOUND");
  const [{ now }] = await tx.select({ now: sql<string>`clock_timestamp()::text`.mapWith((value)=>new Date(value)) }).from(runs).where(eq(runs.id,runId));
  return { run,conversation,now };
}
