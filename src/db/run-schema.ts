import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { appUsers, conversations } from "./conversation-schema";

const instant = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });
export const runStatus = pgEnum("run_status", ["RECEIVED", "CHECKING_INPUT", "PLANNING", "SEARCHING", "PREPARING_EVIDENCE", "GENERATING", "CHECKING_OUTPUT", "COMPLETED", "NEEDS_CLARIFICATION", "BLOCKED", "FAILED", "CANCELLED", "TIMED_OUT"]);
export const ACTIVE_RUN_STATUSES = ["RECEIVED", "CHECKING_INPUT", "PLANNING", "SEARCHING", "PREPARING_EVIDENCE", "GENERATING", "CHECKING_OUTPUT"] as const;
export const budgetKind = pgEnum("budget_kind", ["PERIOD", "DAY"]);
export const attemptKind = pgEnum("attempt_kind", ["MINUTE", "DAY"]);
export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull(), conversationId: uuid("conversation_id").notNull(),
  clientRequestId: uuid("client_request_id").notNull(), payloadHmac: varchar("payload_hmac", { length: 64 }).notNull(),
  hmacKeyId: varchar("hmac_key_id", { length: 32 }).notNull(), payloadVersion: integer("payload_version").notNull().default(1),
  mode: varchar("mode", { length: 16 }).notNull().default("FAST"), modelKey: varchar("model_key", { length: 64 }).notNull().default("fast-default"),
  policyVersion: varchar("policy_version", { length: 32 }).notNull().default("v1"),
  catalogVersion: varchar("catalog_version", { length: 64 }).notNull(), priceVersion: varchar("price_version", { length: 64 }).notNull(),
  entitlementVersion: varchar("entitlement_version", { length: 64 }).notNull(), operatorBudgetKey: varchar("operator_budget_key", { length: 64 }).notNull(),
  answerCredits: integer("answer_credits").notNull(), providerReserveMicroUsd: bigint("provider_reserve_micro_usd", { mode: "bigint" }).notNull(),
  admittedRevision: integer("admitted_revision").notNull(), attemptVersion: integer("attempt_version").notNull().default(1),
  accountingVersion: integer("accounting_version").notNull().default(0),
  status: runStatus("status").notNull().default("RECEIVED"), deadlineAt: instant("deadline_at").notNull(),
  createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.conversationId, t.userId], foreignColumns: [conversations.id, conversations.userId], name: "runs_owned_conversation_fk" }).onDelete("cascade"),
  uniqueIndex("runs_id_conversation_unique").on(t.id, t.conversationId),
  uniqueIndex("runs_owner_intent_unique").on(t.userId, t.clientRequestId),
  uniqueIndex("runs_snapshot_unique").on(t.id, t.userId, t.operatorBudgetKey, t.answerCredits, t.providerReserveMicroUsd),
  uniqueIndex("runs_active_owner_unique").on(t.userId).where(sql`${t.status} IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT')`),
  uniqueIndex("runs_active_conversation_unique").on(t.conversationId).where(sql`${t.status} IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT')`),
  index("runs_status_deadline_idx").on(t.status, t.deadlineAt),
  check("run_accounting_version_valid",sql`${t.accountingVersion} IN (0,1,2)`),
  check("runs_hmac_shape", sql`${t.payloadHmac} ~ '^[a-f0-9]{64}$' AND length(${t.payloadHmac}) = 64`),
  check("runs_snapshot_valid", sql`${t.mode} = 'FAST' AND ${t.payloadVersion} = 1 AND ${t.answerCredits} > 0 AND ${t.providerReserveMicroUsd} > 0 AND ${t.admittedRevision} > 0 AND ${t.attemptVersion} > 0`),
  check("runs_versions_nonempty", sql`length(trim(${t.hmacKeyId})) > 0 AND length(trim(${t.catalogVersion})) > 0 AND length(trim(${t.priceVersion})) > 0 AND length(trim(${t.entitlementVersion})) > 0 AND length(trim(${t.operatorBudgetKey})) > 0 AND length(trim(${t.policyVersion})) > 0 AND length(trim(${t.modelKey})) > 0`),
  check("runs_deadline_valid", sql`${t.deadlineAt} > ${t.createdAt}`),
]);
export const usageBuckets = pgTable("usage_buckets", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  kind: budgetKind("kind").notNull(), startsAt: instant("starts_at").notNull(), endsAt: instant("ends_at").notNull(),
  entitlementVersion: varchar("entitlement_version", { length: 64 }).notNull(),
  retiredAt: instant("retired_at"),
  creditLimit: integer("credit_limit").notNull(), reservedCredits: integer("reserved_credits").notNull().default(0), settledCredits: integer("settled_credits").notNull().default(0),
  providerLimitMicroUsd: bigint("provider_limit_micro_usd", { mode: "bigint" }).notNull(),
  reservedProviderMicroUsd: bigint("reserved_provider_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  settledProviderMicroUsd: bigint("settled_provider_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
}, (t) => [
  uniqueIndex("usage_bucket_window_unique").on(t.userId, t.kind, t.startsAt).where(sql`${t.retiredAt} IS NULL`),
  uniqueIndex("usage_bucket_owner_kind_unique").on(t.id, t.userId, t.kind),
  check("usage_bucket_window_valid", sql`${t.endsAt} > ${t.startsAt} AND length(trim(${t.entitlementVersion})) > 0`),
  check("usage_bucket_credits_valid", sql`${t.creditLimit} >= 0 AND ${t.reservedCredits} >= 0 AND ${t.settledCredits} >= 0 AND ${t.reservedCredits} + ${t.settledCredits} <= ${t.creditLimit}`),
  check("usage_bucket_provider_valid", sql`${t.providerLimitMicroUsd} >= 0 AND ${t.reservedProviderMicroUsd} >= 0 AND ${t.settledProviderMicroUsd} >= 0 AND ${t.reservedProviderMicroUsd} + ${t.settledProviderMicroUsd} <= ${t.providerLimitMicroUsd}`),
]);
export const operatorUsageBuckets = pgTable("operator_usage_buckets", {
  id: uuid("id").primaryKey().defaultRandom(), budgetKey: varchar("budget_key", { length: 64 }).notNull(),
  kind: budgetKind("kind").notNull(), startsAt: instant("starts_at").notNull(), endsAt: instant("ends_at").notNull(),
  providerLimitMicroUsd: bigint("provider_limit_micro_usd", { mode: "bigint" }).notNull(),
  reservedProviderMicroUsd: bigint("reserved_provider_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  settledProviderMicroUsd: bigint("settled_provider_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
}, (t) => [
  uniqueIndex("operator_bucket_window_unique").on(t.budgetKey, t.kind, t.startsAt),
  uniqueIndex("operator_bucket_key_kind_unique").on(t.id, t.budgetKey, t.kind),
  check("operator_bucket_window_valid", sql`${t.endsAt} > ${t.startsAt} AND length(trim(${t.budgetKey})) > 0`),
  check("operator_bucket_provider_valid", sql`${t.providerLimitMicroUsd} >= 0 AND ${t.reservedProviderMicroUsd} >= 0 AND ${t.settledProviderMicroUsd} >= 0 AND ${t.reservedProviderMicroUsd} + ${t.settledProviderMicroUsd} <= ${t.providerLimitMicroUsd}`),
]);
// Bucket FKs are DEFERRABLE INITIALLY DEFERRED in reviewed SQL; Drizzle Kit does not model deferral.
export const usageReservations = pgTable("usage_reservations", {
  runId: uuid("run_id").primaryKey(), userId: uuid("user_id").notNull(), operatorBudgetKey: varchar("operator_budget_key", { length: 64 }).notNull(),
  periodBucketId: uuid("period_bucket_id").notNull(), dayBucketId: uuid("day_bucket_id").notNull(),
  operatorPeriodBucketId: uuid("operator_period_bucket_id").notNull(), operatorDayBucketId: uuid("operator_day_bucket_id").notNull(),
  periodKind: budgetKind("period_kind").notNull().default("PERIOD"), dayKind: budgetKind("day_kind").notNull().default("DAY"),
  answerCredits: integer("answer_credits").notNull(), providerReserveMicroUsd: bigint("provider_reserve_micro_usd", { mode: "bigint" }).notNull(),
  createdAt: instant("created_at").notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.runId, t.userId, t.operatorBudgetKey, t.answerCredits, t.providerReserveMicroUsd], foreignColumns: [runs.id, runs.userId, runs.operatorBudgetKey, runs.answerCredits, runs.providerReserveMicroUsd], name: "reservation_run_snapshot_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.periodBucketId, t.userId, t.periodKind], foreignColumns: [usageBuckets.id, usageBuckets.userId, usageBuckets.kind], name: "reservation_user_period_fk" }),
  foreignKey({ columns: [t.dayBucketId, t.userId, t.dayKind], foreignColumns: [usageBuckets.id, usageBuckets.userId, usageBuckets.kind], name: "reservation_user_day_fk" }),
  foreignKey({ columns: [t.operatorPeriodBucketId, t.operatorBudgetKey, t.periodKind], foreignColumns: [operatorUsageBuckets.id, operatorUsageBuckets.budgetKey, operatorUsageBuckets.kind], name: "reservation_operator_period_fk" }),
  foreignKey({ columns: [t.operatorDayBucketId, t.operatorBudgetKey, t.dayKind], foreignColumns: [operatorUsageBuckets.id, operatorUsageBuckets.budgetKey, operatorUsageBuckets.kind], name: "reservation_operator_day_fk" }),
  check("reservation_kinds_valid", sql`${t.periodKind} = 'PERIOD' AND ${t.dayKind} = 'DAY'`),
]);
export const admissionAttemptBuckets = pgTable("admission_attempt_buckets", {
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }), kind: attemptKind("kind").notNull(),
  startsAt: instant("starts_at").notNull(), endsAt: instant("ends_at").notNull(), attempts: integer("attempts").notNull().default(1),
}, (t) => [
  uniqueIndex("admission_attempt_window_unique").on(t.userId, t.kind, t.startsAt),
  check("admission_attempt_count_valid", sql`${t.attempts} >= 0`),
  check("admission_attempt_window_valid", sql`(${t.kind} = 'MINUTE' AND ${t.endsAt} = ${t.startsAt} + interval '1 minute') OR (${t.kind} = 'DAY' AND ${t.endsAt} = ${t.startsAt} + interval '1 day')`),
]);
