import { prepareEntitlement } from "@/server/billing/entitlements";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ACTIVE_RUN_STATUSES, appUsers, conversations, runs, usageReservations } from "@/db/schema";
import { submissionSchema } from "@/server/contracts/chat";
import type { PublicErrorCode } from "@/server/contracts/errors";
import { AdmissionError } from "./errors";
import { admissionPolicySchema, fingerprintSubmission, FREE_ADMISSION_POLICY, matchesFingerprint, parseAdmissionConfig } from "./policy";
import { consumeAttempts, loadBudgets, reserveBudgets, type AdmissionDatabase } from "./usage";

type Run = typeof runs.$inferSelect;
type RunReference = { id: string; conversationId: string; revision: number; status: Run["status"]; deadlineAt: string };
export type AdmissionResult =
  | { kind: "ADMITTED" | "RUN_IN_PROGRESS" | "RUN_ALREADY_FINISHED"; run: RunReference }
  | { kind: "DENIED"; code: PublicErrorCode };
const reference = (run: Run): RunReference => ({ id: run.id, conversationId: run.conversationId, revision: run.admittedRevision,
  status: run.status, deadlineAt: run.deadlineAt.toISOString() });
const denied = (code: PublicErrorCode): AdmissionResult => ({ kind: "DENIED", code });
const isActive = (status: Run["status"]) => ACTIVE_RUN_STATUSES.some((value)=>value === status);

// Internal API: authSubject comes only from the verified application session, never from a body.
export function createRunAdmission(db: AdmissionDatabase, configInput: unknown, policyInput: unknown = FREE_ADMISSION_POLICY,assertNewRunAvailable?:(modelKey:string)=>void,entitlements=false) {
  const config = parseAdmissionConfig(configInput);
  const parsedPolicy = admissionPolicySchema.safeParse(policyInput);
  if (!parsedPolicy.success) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
  const basePolicy = Object.freeze(parsedPolicy.data);
  return {
    async admit(authSubject: string, input: unknown): Promise<AdmissionResult> {
      const parsed = submissionSchema.safeParse(input);
      if (!parsed.success) throw new AdmissionError("INVALID_INPUT");
      const request = parsed.data;
      return db.transaction(async (tx) => {
        let policy = basePolicy, carryPeriod = 0, carryDay = 0;
        await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
        const [owner] = await tx.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.authSubject,authSubject)).limit(1);
        if (!owner) return denied("NOT_FOUND");
        // Transaction-scoped only: compatible with a pooled connection and multiple app processes.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'run-admission:'+owner.id}::text,0))`);
        const [conversation] = await tx.select().from(conversations).where(and(eq(conversations.id,request.conversationId),eq(conversations.userId,owner.id))).for("update");
        if (!conversation || conversation.deletedAt) return denied("NOT_FOUND");
        const [existing] = await tx.select().from(runs).where(and(eq(runs.userId,owner.id),eq(runs.clientRequestId,request.clientRequestId))).limit(1);
        if (existing) {
          if (!matchesFingerprint(request,existing,{ hmac: existing.payloadHmac, keyId: existing.hmacKeyId, version: existing.payloadVersion },config)) return denied("IDEMPOTENCY_MISMATCH");
          return { kind: isActive(existing.status) ? "RUN_IN_PROGRESS" : "RUN_ALREADY_FINISHED", run: reference(existing) };
        }
        // Synchronous configuration checks only; replay/recovery never needs a provider.
        // Keep this before counters/reservations and never perform network I/O under the lock.
        try { assertNewRunAvailable?.(request.modelKey); }
        catch(error) { if(error instanceof AdmissionError)return denied(error.code);throw error; }
        const [{ now }] = await tx.select({ now: sql<string>`clock_timestamp()::text`.mapWith((value) => new Date(value)) }).from(appUsers).where(eq(appUsers.id,owner.id));
        if(entitlements) {
          try { const result=await prepareEntitlement(tx,owner.id,request.modelKey,basePolicy,now);policy=result.policy;carryPeriod=result.carryPeriod;carryDay=result.carryDay; }
          catch(error){if(error instanceof AdmissionError)return denied(error.code);throw error;}
        }
        if (!await consumeAttempts(tx,owner.id,now,policy)) return denied("RATE_LIMITED");
        // Expected denials roll back this savepoint, retaining only the consumed attempt counters.
        try {
          return await tx.transaction(async (reserve): Promise<AdmissionResult> => {
            if (conversation.revision !== request.expectedRevision) return denied("CONFLICT");
            const active = await reserve.select({ id: runs.id }).from(runs).where(and(eq(runs.userId,owner.id),inArray(runs.status,[...ACTIVE_RUN_STATUSES]))).limit(1);
            if (active.length) return denied("RUN_IN_PROGRESS");
            const budgets = await loadBudgets(reserve,owner.id,policy.operatorBudgetKey,now);
            if(budgets.period.creditLimit-budgets.period.settledCredits-budgets.period.reservedCredits-carryPeriod<policy.answerCredits || budgets.day.creditLimit-budgets.day.settledCredits-budgets.day.reservedCredits-carryDay<policy.answerCredits)return denied("BUDGET_EXCEEDED");
            const snapshot = { ...policy, entitlementVersion: budgets.period.entitlementVersion };
            const fingerprint = fingerprintSubmission(request,snapshot,config);
            await reserveBudgets(reserve,budgets,policy);
            const [run] = await reserve.insert(runs).values({
              accountingVersion: 2, userId: owner.id, conversationId: conversation.id, clientRequestId: request.clientRequestId,
              payloadHmac: fingerprint.hmac, hmacKeyId: fingerprint.keyId, payloadVersion: fingerprint.version,
              mode: request.mode, modelKey: request.modelKey, policyVersion: policy.policyVersion,
              catalogVersion: policy.catalogVersion, priceVersion: policy.priceVersion, entitlementVersion: snapshot.entitlementVersion,
              operatorBudgetKey: policy.operatorBudgetKey, answerCredits: policy.answerCredits, providerReserveMicroUsd: policy.providerReserveMicroUsd,
              admittedRevision: conversation.revision+1, deadlineAt: new Date(now.getTime()+policy.deadlineMs), createdAt: now, updatedAt: now,
            }).returning();
            await reserve.insert(usageReservations).values({ runId: run.id, userId: owner.id, operatorBudgetKey: policy.operatorBudgetKey,
              periodBucketId: budgets.period.id, dayBucketId: budgets.day.id,
              operatorPeriodBucketId: budgets.operatorPeriod.id, operatorDayBucketId: budgets.operatorDay.id,
              answerCredits: policy.answerCredits, providerReserveMicroUsd: policy.providerReserveMicroUsd, createdAt: now });
            await reserve.update(conversations).set({ revision: run.admittedRevision, updatedAt: now }).where(and(eq(conversations.id,conversation.id),eq(conversations.userId,owner.id)));
            return { kind: "ADMITTED", run: reference(run) };
          });
        } catch (error) { if (error instanceof AdmissionError) return denied(error.code); throw error; }
      });
    },
  };
}
