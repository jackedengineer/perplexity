import { sql } from 'drizzle-orm';
import { bigint,check,foreignKey,integer,pgTable,primaryKey,timestamp,uniqueIndex,uuid,varchar } from 'drizzle-orm/pg-core';
import { providerCalls,runSettlements } from './completion-schema';
export const providerUsageResolutions=pgTable('provider_usage_resolutions',{
  callId:uuid('call_id').primaryKey(),runId:uuid('run_id').notNull(),
  costMicroUsd:bigint('cost_micro_usd',{mode:'bigint'}).notNull(),kind:varchar('kind',{length:24}).notNull(),
  evidenceHash:varchar('evidence_hash',{length:64}).notNull(),createdAt:timestamp('created_at',{withTimezone:true,precision:3}).notNull().defaultNow(),
},t=>[
  foreignKey({columns:[t.callId,t.runId],foreignColumns:[providerCalls.id,providerCalls.runId],name:'usage_resolution_call_run_fk'}).onDelete('cascade'),
  check('usage_resolution_valid',sql`${t.costMicroUsd} BETWEEN 0 AND 150000 AND ${t.kind} IN ('PROVIDER_RECEIPT','VERIFIED_NOT_BILLED') AND (${t.kind} <> 'VERIFIED_NOT_BILLED' OR ${t.costMicroUsd}=0) AND ${t.evidenceHash} ~ '^[a-f0-9]{64}$'`),
]);
export const runReconciliations=pgTable('run_reconciliations',{
  runId:uuid('run_id').notNull().references(()=>runSettlements.runId,{onDelete:'cascade'}),version:integer('version').notNull(),
  previousHeldMicroUsd:bigint('previous_held_micro_usd',{mode:'bigint'}).notNull(),
  chargedMicroUsd:bigint('charged_micro_usd',{mode:'bigint'}).notNull(),releasedMicroUsd:bigint('released_micro_usd',{mode:'bigint'}).notNull(),
  remainingHeldMicroUsd:bigint('remaining_held_micro_usd',{mode:'bigint'}).notNull(),
  createdAt:timestamp('created_at',{withTimezone:true,precision:3}).notNull().defaultNow(),
},t=>[
  primaryKey({columns:[t.runId,t.version]}),uniqueIndex('reconciliation_run_hold_unique').on(t.runId,t.previousHeldMicroUsd),
  check('reconciliation_amounts_valid',sql`${t.version}>0 AND ${t.chargedMicroUsd}>=0 AND ${t.releasedMicroUsd}>=0 AND ${t.remainingHeldMicroUsd}>=0 AND ${t.previousHeldMicroUsd}=${t.chargedMicroUsd}+${t.releasedMicroUsd}+${t.remainingHeldMicroUsd} AND ${t.chargedMicroUsd}+${t.releasedMicroUsd}>0`),
]);
