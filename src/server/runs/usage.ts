import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { admissionAttemptBuckets as attempts, operatorUsageBuckets as operator, usageBuckets as user } from "@/db/schema";
import { AdmissionError } from "./errors";
import { getAttemptWindows } from "./windows";
import type { AdmissionPolicy } from "./policy";

export type AdmissionDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
export type AdmissionTransaction = Parameters<Parameters<AdmissionDatabase["transaction"]>[0]>[0];
export async function consumeAttempts(tx: AdmissionTransaction, userId: string, now: Date, policy: AdmissionPolicy) {
  const result = await tx.insert(attempts).values(getAttemptWindows(now).map((window) => ({ ...window, userId, attempts: 1 })))
    .onConflictDoUpdate({ target: [attempts.userId, attempts.kind, attempts.startsAt], set: { attempts: sql`${attempts.attempts} + 1` },
      setWhere: sql`${attempts.attempts} < CASE WHEN ${attempts.kind} = 'MINUTE' THEN ${policy.attemptsPerMinute}::integer ELSE ${policy.attemptsPerDay}::integer END` })
    .returning({ kind: attempts.kind });
  return result.length === 2;
}
export async function loadBudgets(tx: AdmissionTransaction, userId: string, budgetKey: string, now: Date) {
  const users = await tx.select().from(user).where(and(eq(user.userId,userId),isNull(user.retiredAt),lte(user.startsAt,now),gt(user.endsAt,now)))
    .orderBy(user.id).limit(3).for("update");
  if (!users.length) throw new AdmissionError("BUDGET_EXCEEDED");
  const operators = await tx.select().from(operator).where(and(eq(operator.budgetKey,budgetKey),lte(operator.startsAt,now),gt(operator.endsAt,now)))
    .orderBy(operator.id).limit(3).for("update");
  const period = users.find((bucket)=>bucket.kind === "PERIOD"), day = users.find((bucket)=>bucket.kind === "DAY");
  const operatorPeriod = operators.find((bucket)=>bucket.kind === "PERIOD"), operatorDay = operators.find((bucket)=>bucket.kind === "DAY");
  if (users.length !== 2 || operators.length !== 2 || !period || !day || !operatorPeriod || !operatorDay || period.entitlementVersion !== day.entitlementVersion) {
    throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
  }
  return { period, day, operatorPeriod, operatorDay };
}
export async function reserveBudgets(tx: AdmissionTransaction, budgets: Awaited<ReturnType<typeof loadBudgets>>, policy: AdmissionPolicy) {
  const users = await tx.update(user).set({
    reservedCredits: sql`${user.reservedCredits} + ${policy.answerCredits}`,
    reservedProviderMicroUsd: sql`${user.reservedProviderMicroUsd} + ${policy.providerReserveMicroUsd}`,
  }).where(and(inArray(user.id,[budgets.period.id,budgets.day.id]),eq(user.userId,budgets.period.userId),
    lte(user.startsAt,sql`clock_timestamp()`),gt(user.endsAt,sql`clock_timestamp()`),
    sql`${user.creditLimit} - ${user.reservedCredits} - ${user.settledCredits} >= ${policy.answerCredits}`,
    sql`${user.providerLimitMicroUsd} - ${user.reservedProviderMicroUsd} - ${user.settledProviderMicroUsd} >= ${policy.providerReserveMicroUsd}`,
  )).returning({ id: user.id });
  if (users.length !== 2) throw new AdmissionError("BUDGET_EXCEEDED");
  const operators = await tx.update(operator).set({ reservedProviderMicroUsd: sql`${operator.reservedProviderMicroUsd} + ${policy.providerReserveMicroUsd}` })
    .where(and(inArray(operator.id,[budgets.operatorPeriod.id,budgets.operatorDay.id]),eq(operator.budgetKey,policy.operatorBudgetKey),
      lte(operator.startsAt,sql`clock_timestamp()`),gt(operator.endsAt,sql`clock_timestamp()`),
      sql`${operator.providerLimitMicroUsd} - ${operator.reservedProviderMicroUsd} - ${operator.settledProviderMicroUsd} >= ${policy.providerReserveMicroUsd}`,
    )).returning({ id: operator.id });
  if (operators.length !== 2) throw new AdmissionError("BUDGET_EXCEEDED");
}
