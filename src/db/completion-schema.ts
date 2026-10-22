import { sql } from "drizzle-orm";
import { bigint,check,foreignKey,integer,jsonb,pgTable,primaryKey,timestamp,uniqueIndex,uuid,varchar } from "drizzle-orm/pg-core";
import { messages,messageRole } from "./conversation-schema";
import { runs } from "./run-schema";
import { runSources,sourcePassages } from "./retrieval-schema";
import type { ApprovedPayload } from "@/server/contracts/answer";
const instant = (name: string) => timestamp(name,{ withTimezone: true,precision: 3 });
export const providerCalls = pgTable("provider_calls",{
  id: uuid("id").primaryKey().defaultRandom(),runId: uuid("run_id").notNull().references(()=>runs.id,{ onDelete: "cascade" }),
  stage: varchar("stage",{ length: 24 }).notNull(),attemptVersion: integer("attempt_version").notNull(),
  requestedModel: varchar("requested_model",{ length: 128 }).notNull(),actualModel: varchar("actual_model",{ length: 128 }),
  capMicroUsd: bigint("cap_micro_usd",{ mode: "bigint" }).notNull(),status: varchar("status",{ length: 16 }).notNull(),
  costMicroUsd: bigint("cost_micro_usd",{ mode: "bigint" }),inputTokens: integer("input_tokens"),outputTokens: integer("output_tokens"),searchCredits: integer("search_credits"),
  startedAt: instant("started_at").notNull(),finishedAt: instant("finished_at"),
},t=>[
  uniqueIndex("provider_run_stage_unique").on(t.runId,t.stage),
  check("provider_attempt_valid",sql`${t.attemptVersion} > 0 AND length(trim(${t.requestedModel})) > 0 AND ${t.status} IN ('STARTED','SUCCEEDED','UNKNOWN','SKIPPED')`),
  check("provider_cap_valid",sql`${t.capMicroUsd} > 0 AND ${t.capMicroUsd} = CASE ${t.stage} WHEN 'INPUT_SAFETY' THEN 5000 WHEN 'QUERY_SAFETY' THEN 5000 WHEN 'SEARCH' THEN 8000 WHEN 'EVIDENCE_SAFETY' THEN 5000 WHEN 'ANSWER' THEN 20000 WHEN 'OUTPUT_SAFETY' THEN 5000 ELSE -1 END`),
  check("provider_usage_valid",sql`(${t.costMicroUsd} IS NULL OR ${t.costMicroUsd} >= 0) AND (${t.inputTokens} IS NULL OR ${t.inputTokens} BETWEEN 0 AND 1000000) AND (${t.outputTokens} IS NULL OR ${t.outputTokens} BETWEEN 0 AND 1000000) AND (${t.searchCredits} IS NULL OR ${t.searchCredits} = 1)`),
  check("provider_lifecycle_valid",sql`(${t.status} = 'STARTED' AND ${t.finishedAt} IS NULL AND ${t.costMicroUsd} IS NULL) OR (${t.status} <> 'STARTED' AND ${t.finishedAt} IS NOT NULL AND ${t.finishedAt} >= ${t.startedAt} AND (${t.status} <> 'SKIPPED' OR ${t.costMicroUsd} IS NOT DISTINCT FROM 0))`),
]);
export const outputReviews = pgTable("output_safety_reviews",{
  runId: uuid("run_id").primaryKey(),conversationId: uuid("conversation_id").notNull(),attemptVersion: integer("attempt_version").notNull(),
  decision: varchar("decision",{ length: 16 }).notNull(),policyVersion: varchar("policy_version",{ length: 32 }).notNull(),
  messageId: uuid("message_id"),messageRole: messageRole("message_role").notNull().default("ASSISTANT"),
  bodyHash: varchar("body_hash",{ length: 64 }),payloadHash: varchar("payload_hash",{ length: 64 }),payload: jsonb("payload").$type<ApprovedPayload>(),
  createdAt: instant("created_at").notNull(),
},t=>[
  foreignKey({ columns: [t.runId,t.conversationId],foreignColumns: [runs.id,runs.conversationId],name: "output_review_owned_run_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.messageId,t.conversationId,t.messageRole],foreignColumns: [messages.id,messages.conversationId,messages.role],name: "output_review_assistant_fk" }).onDelete("cascade"),
  uniqueIndex("output_review_message_unique").on(t.messageId),uniqueIndex("output_review_run_message_unique").on(t.runId,t.messageId),
  check("output_review_valid",sql`${t.attemptVersion} > 0 AND ${t.messageRole} = 'ASSISTANT' AND length(trim(${t.policyVersion})) > 0 AND ${t.decision} IN ('ALLOW','BLOCK','UNAVAILABLE')`),
  check("output_review_content_valid",sql`(${t.decision} = 'ALLOW' AND ${t.messageId} IS NOT NULL AND ${t.bodyHash} IS NOT NULL AND ${t.payloadHash} IS NOT NULL AND ${t.payload} IS NOT NULL AND ${t.bodyHash} ~ '^[a-f0-9]{64}$' AND ${t.payloadHash} ~ '^[a-f0-9]{64}$' AND jsonb_typeof(${t.payload}) = 'object' AND (${t.payload}->>'runId') IS NOT DISTINCT FROM ${t.runId}::text AND jsonb_typeof(${t.payload}->'markdown') IS NOT DISTINCT FROM 'string' AND ${t.bodyHash} = encode(sha256(convert_to(${t.payload}->>'markdown','UTF8')),'hex')) OR (${t.decision} <> 'ALLOW' AND ${t.messageId} IS NULL AND ${t.bodyHash} IS NULL AND ${t.payloadHash} IS NULL AND ${t.payload} IS NULL)`),
]);
export const messageCitations = pgTable("message_citations",{
  runId: uuid("run_id").notNull(),messageId: uuid("message_id").notNull(),sourceId: uuid("source_id").notNull(),passageId: uuid("passage_id").notNull(),
  number: integer("display_number").notNull(),supportStatus: varchar("support_status",{ length: 16 }).notNull().default("NOT_CHECKED"),
},t=>[
  primaryKey({ columns: [t.messageId,t.number] }),uniqueIndex("citation_message_source_unique").on(t.messageId,t.sourceId),
  foreignKey({ columns: [t.runId,t.messageId],foreignColumns: [outputReviews.runId,outputReviews.messageId],name: "citation_same_run_message_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.runId,t.sourceId],foreignColumns: [runSources.runId,runSources.id],name: "citation_same_run_source_fk" }).onDelete("cascade"),
  foreignKey({ columns: [t.runId,t.sourceId,t.passageId],foreignColumns: [sourcePassages.runId,sourcePassages.sourceId,sourcePassages.id],name: "citation_same_source_passage_fk" }).onDelete("cascade"),
  check("citation_metadata_valid",sql`${t.number} BETWEEN 1 AND 5 AND ${t.supportStatus} = 'NOT_CHECKED'`),
]);
export const runSettlements = pgTable("run_settlements",{
  runId: uuid("run_id").primaryKey().references(()=>runs.id,{ onDelete: "cascade" }),
  creditsCharged: integer("credits_charged").notNull(),knownProviderMicroUsd: bigint("known_provider_micro_usd",{ mode: "bigint" }).notNull(),
  heldProviderMicroUsd: bigint("held_provider_micro_usd",{ mode: "bigint" }).notNull(),releasedProviderMicroUsd: bigint("released_provider_micro_usd",{ mode: "bigint" }).notNull(),
  createdAt: instant("created_at").notNull(),
},t=>[
  check("settlement_amounts_valid",sql`${t.creditsCharged} BETWEEN 0 AND 15 AND ${t.knownProviderMicroUsd} >= 0 AND ${t.heldProviderMicroUsd} >= 0 AND ${t.releasedProviderMicroUsd} >= 0`),
]);
