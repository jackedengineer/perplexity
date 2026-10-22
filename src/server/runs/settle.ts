import { and,eq,inArray,sql } from "drizzle-orm";
import { providerCalls,runSettlements,usageBuckets,operatorUsageBuckets,usageReservations,runs } from "@/db/schema";
import type { AdmissionTransaction } from "./usage";
import { AdmissionError } from "./errors";
export async function settleRun(tx: AdmissionTransaction,run: typeof runs.$inferSelect,creditsCharged: number,now: Date) {
  const [reservation] = await tx.select().from(usageReservations).where(and(eq(usageReservations.runId,run.id),eq(usageReservations.userId,run.userId)));
  if (!reservation || creditsCharged > reservation.answerCredits) throw new AdmissionError("CONFLICT");
  const calls = await tx.select().from(providerCalls).where(eq(providerCalls.runId,run.id));
  const known = calls.reduce((sum,call)=>sum+(call.costMicroUsd ?? 0n),0n);
  const unknown = run.accountingVersion === 0 || calls.some(call=>call.status === "STARTED" || call.status === "UNKNOWN" || call.costMicroUsd === null);
  const held = unknown ? reservation.providerReserveMicroUsd-known : 0n;
  const released = reservation.providerReserveMicroUsd-known-held;
  if (calls.some(call=>(call.costMicroUsd ?? 0n) > call.capMicroUsd) || known > reservation.providerReserveMicroUsd || held < 0n || released < 0n) throw new AdmissionError("BUDGET_EXCEEDED");
  const userIds = [reservation.periodBucketId,reservation.dayBucketId],operatorIds = [reservation.operatorPeriodBucketId,reservation.operatorDayBucketId];
  const users = await tx.select().from(usageBuckets).where(and(eq(usageBuckets.userId,run.userId),inArray(usageBuckets.id,userIds))).orderBy(usageBuckets.id).for("update");
  const operators = await tx.select().from(operatorUsageBuckets).where(and(eq(operatorUsageBuckets.budgetKey,run.operatorBudgetKey),inArray(operatorUsageBuckets.id,operatorIds))).orderBy(operatorUsageBuckets.id).for("update");
  if (users.length !== 2 || operators.length !== 2) throw new AdmissionError("CONFLICT");
  const moved = reservation.providerReserveMicroUsd-held;
  const userChanges = await tx.update(usageBuckets).set({ reservedCredits: sql`${usageBuckets.reservedCredits} - ${reservation.answerCredits}`,
    settledCredits: sql`${usageBuckets.settledCredits} + ${creditsCharged}`,reservedProviderMicroUsd: sql`${usageBuckets.reservedProviderMicroUsd} - ${moved}`,
    settledProviderMicroUsd: sql`${usageBuckets.settledProviderMicroUsd} + ${known}` }).where(and(eq(usageBuckets.userId,run.userId),inArray(usageBuckets.id,userIds),
      sql`${usageBuckets.reservedCredits} >= ${reservation.answerCredits}`,sql`${usageBuckets.reservedProviderMicroUsd} >= ${moved}`)).returning({ id: usageBuckets.id });
  const operatorChanges = await tx.update(operatorUsageBuckets).set({ reservedProviderMicroUsd: sql`${operatorUsageBuckets.reservedProviderMicroUsd} - ${moved}`,
    settledProviderMicroUsd: sql`${operatorUsageBuckets.settledProviderMicroUsd} + ${known}` }).where(and(eq(operatorUsageBuckets.budgetKey,run.operatorBudgetKey),inArray(operatorUsageBuckets.id,operatorIds),
      sql`${operatorUsageBuckets.reservedProviderMicroUsd} >= ${moved}`)).returning({ id: operatorUsageBuckets.id });
  if (userChanges.length !== 2 || operatorChanges.length !== 2) throw new AdmissionError("CONFLICT");
  await tx.insert(runSettlements).values({ runId: run.id,creditsCharged,knownProviderMicroUsd: known,heldProviderMicroUsd: held,releasedProviderMicroUsd: released,createdAt: now });
}
