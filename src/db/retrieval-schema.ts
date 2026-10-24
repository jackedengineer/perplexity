import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { runs } from "./run-schema";
const instant = (name: string) => timestamp(name,{ withTimezone: true,precision: 3 });
export const runRetrievals = pgTable("run_retrievals",{
  runId: uuid("run_id").primaryKey().references(()=>runs.id,{ onDelete: "cascade" }),
  attemptVersion: integer("attempt_version").notNull(),policyVersion: varchar("policy_version",{ length: 32 }).notNull(),
  detectorVersion: varchar("detector_version",{ length: 32 }).notNull(),modelId: varchar("model_id",{ length: 128 }).notNull(),
  status: varchar("status",{ length: 24 }).notNull(),queryVerdict: varchar("query_verdict",{ length: 16 }),evidenceVerdict: varchar("evidence_verdict",{ length: 16 }),
  searchCredits: integer("search_credits"),createdAt: instant("created_at").notNull(),expiresAt: instant("expires_at").notNull(),
},t=>[
  check("retrieval_metadata_valid",sql`${t.attemptVersion} > 0 AND length(trim(${t.policyVersion})) > 0 AND length(trim(${t.detectorVersion})) > 0 AND length(trim(${t.modelId})) > 0 AND ${t.expiresAt} > ${t.createdAt}`),
  check("retrieval_outcome_valid",sql`${t.status} IN ('STARTED','READY','NO_EVIDENCE','BLOCKED','UNAVAILABLE') AND (${t.queryVerdict} IS NULL OR ${t.queryVerdict} IN ('ALLOW','BLOCK','UNAVAILABLE')) AND (${t.evidenceVerdict} IS NULL OR ${t.evidenceVerdict} IN ('ALLOW','BLOCK','UNAVAILABLE')) AND (${t.searchCredits} IS NULL OR ${t.searchCredits} BETWEEN 1 AND 2)`),
  check("retrieval_ready_reviewed",sql`${t.status} NOT IN ('READY','NO_EVIDENCE') OR (${t.queryVerdict} IS NOT DISTINCT FROM 'ALLOW' AND coalesce(${t.searchCredits},0) BETWEEN 1 AND 2 AND (${t.status} = 'NO_EVIDENCE' OR ${t.evidenceVerdict} IS NOT DISTINCT FROM 'ALLOW'))`),
]);
export const runSources = pgTable("run_sources",{
  id: uuid("id").primaryKey().defaultRandom(),runId: uuid("run_id").notNull().references(()=>runRetrievals.runId,{ onDelete: "cascade" }),
  sourceKey: varchar("source_key",{ length: 3 }).notNull(),url: varchar("url",{ length: 2048 }).notNull(),title: varchar("title",{ length: 300 }).notNull(),
  rank: integer("rank").notNull(),publishedAt: instant("published_at"),retrievedAt: instant("retrieved_at").notNull(),
},t=>[
  uniqueIndex("source_run_key_unique").on(t.runId,t.sourceKey),uniqueIndex("source_run_url_unique").on(t.runId,t.url),
  uniqueIndex("source_run_id_unique").on(t.runId,t.id),
  check("source_metadata_valid",sql`${t.sourceKey} ~ '^S[1-5]$' AND ${t.rank} BETWEEN 1 AND 5 AND length(trim(${t.title})) > 0 AND ${t.url} ~ '^https?://'`),
  pgPolicy("sources_runtime_read",{ for: "select",using: sql`true` }),
  pgPolicy("sources_reviewed_insert",{ for: "insert",withCheck: sql`EXISTS (SELECT 1 FROM run_retrievals r WHERE r.run_id = ${t.runId} AND r.status = 'READY' AND r.query_verdict = 'ALLOW' AND r.evidence_verdict = 'ALLOW')` }),
]).enableRLS();
export const sourcePassages = pgTable("source_passages",{
  id: uuid("id").primaryKey(),runId: uuid("run_id").notNull(),sourceId: uuid("source_id").notNull(),
  text: text("excerpt").notNull(),contentHash: varchar("content_hash",{ length: 64 }).notNull(),
  contentKind: varchar("content_kind",{ length: 24 }).notNull(),
},t=>[
  foreignKey({ columns: [t.runId,t.sourceId],foreignColumns: [runSources.runId,runSources.id],name: "passage_same_run_source_fk" }).onDelete("cascade"),
  uniqueIndex("passage_run_source_id_unique").on(t.runId,t.sourceId,t.id),
  uniqueIndex("passage_source_unique").on(t.sourceId),uniqueIndex("passage_run_id_unique").on(t.runId,t.id),
  check("passage_content_valid",sql`length(${t.text}) BETWEEN 1 AND 1000 AND length(trim(${t.text})) > 0 AND ${t.contentKind} IN ('SEARCH_PASSAGE','EXTRACTED_PAGE') AND ${t.contentHash} = encode(sha256(convert_to(${t.text},'UTF8')),'hex')`),
  pgPolicy("passages_expired_delete",{for:"delete",using:sql`EXISTS (SELECT 1 FROM run_retrievals r JOIN runs q ON q.id=r.run_id WHERE r.run_id = source_passages.run_id AND r.expires_at < clock_timestamp() AND q.status NOT IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT'))`}),
  pgPolicy("passages_runtime_read",{ for: "select",using: sql`true` }),
  pgPolicy("passages_reviewed_insert",{ for: "insert",withCheck: sql`EXISTS (SELECT 1 FROM run_retrievals r WHERE r.run_id = ${t.runId} AND r.status = 'READY' AND r.query_verdict = 'ALLOW' AND r.evidence_verdict = 'ALLOW')` }),
]).enableRLS();
