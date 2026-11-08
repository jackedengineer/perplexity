import { sql } from "drizzle-orm";
import { bigint, check, customType, date, foreignKey, index, integer, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid, varchar, vector } from "drizzle-orm/pg-core";
import { appUsers } from "./conversation-schema";
import { runs } from "./run-schema";
const instant = (name: string) => timestamp(name,{ withTimezone: true,precision: 3 });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

// One embedding model per deployment; stored on each chunk so a later model change can re-embed safely.
export const DOCUMENT_EMBEDDING_DIMENSIONS = 1536;

// A user's private PDF. The original bytes live in object storage under storageKey;
// only extracted, page-numbered chunks are searchable.
export const documents = pgTable("documents",{
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(()=>appUsers.id,{ onDelete: "cascade" }),
  title: varchar("title",{ length: 200 }).notNull(),
  contentHash: varchar("content_hash",{ length: 64 }).notNull(),
  storageKey: varchar("storage_key",{ length: 200 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  pageCount: integer("page_count").notNull(),
  status: varchar("status",{ length: 16 }).notNull(),
  failureCode: varchar("failure_code",{ length: 32 }),
  chunkCount: integer("chunk_count").notNull().default(0),
  embeddedCount: integer("embedded_count").notNull().default(0),
  costMicroUsd: bigint("cost_micro_usd",{ mode: "bigint" }).notNull().default(sql`0`),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
},t=>[
  uniqueIndex("documents_owner_content_unique").on(t.userId,t.contentHash),
  uniqueIndex("documents_owner_id_unique").on(t.id,t.userId),
  index("documents_owner_created_idx").on(t.userId,t.createdAt),
  check("documents_valid",sql`length(trim(${t.title})) > 0 AND ${t.contentHash} ~ '^[a-f0-9]{64}$' AND ${t.byteSize} > 0 AND ${t.pageCount} >= 0 AND ${t.status} IN ('PROCESSING','READY','FAILED') AND (${t.status} = 'FAILED') = (${t.failureCode} IS NOT NULL) AND ${t.chunkCount} >= 0 AND ${t.embeddedCount} BETWEEN 0 AND ${t.chunkCount} AND ${t.costMicroUsd} >= 0 AND (${t.status} <> 'READY' OR ${t.embeddedCount} = ${t.chunkCount})`),
]);

// Chunks never cross a page, so every citation points at exactly one page.
export const documentChunks = pgTable("document_chunks",{
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull(),
  userId: uuid("user_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  page: integer("page").notNull(),
  text: text("text").notNull(),
  searchText: tsvector("search_text").notNull().generatedAlwaysAs(sql`to_tsvector('english', text)`),
  embedding: vector("embedding",{ dimensions: DOCUMENT_EMBEDDING_DIMENSIONS }),
  embeddingModel: varchar("embedding_model",{ length: 128 }),
  leaseUntil: instant("lease_until"),
  attempts: integer("attempts").notNull().default(0),
},t=>[
  foreignKey({ columns: [t.documentId,t.userId],foreignColumns: [documents.id,documents.userId],name: "chunk_same_owner_document_fk" }).onDelete("cascade"),
  uniqueIndex("document_chunk_ordinal_unique").on(t.documentId,t.ordinal),
  index("document_chunks_owner_idx").on(t.userId),
  index("document_chunks_pending_idx").on(t.documentId).where(sql`${t.embedding} IS NULL`),
  index("document_chunks_search_idx").using("gin",t.searchText),
  check("document_chunk_valid",sql`${t.ordinal} >= 0 AND ${t.page} >= 1 AND length(${t.text}) BETWEEN 1 AND 1000 AND length(trim(${t.text})) > 0 AND (${t.embedding} IS NULL) = (${t.embeddingModel} IS NULL) AND ${t.attempts} BETWEEN 0 AND 10`),
]);

// Characters accepted per user per UTC day. Counted when a file is accepted and never
// reduced by deleting it, so delete-and-reupload can't bypass the daily allowance.
export const documentUsage = pgTable("document_usage",{
  userId: uuid("user_id").notNull().references(()=>appUsers.id,{ onDelete: "cascade" }),
  day: date("day").notNull(),
  characters: bigint("characters",{ mode: "number" }).notNull(),
},t=>[
  primaryKey({ columns: [t.userId,t.day] }),
  check("document_usage_valid",sql`${t.characters} > 0`),
]);

// Files attached to one question. Retrieval for that run searches only these files.
// Deleting a file nulls its document_id but keeps the row, so a run admitted with files can
// tell one was deleted mid-run and fail, rather than searching everything or nothing.
export const runDocuments = pgTable("run_documents",{
  runId: uuid("run_id").notNull().references(()=>runs.id,{ onDelete: "cascade" }),
  documentId: uuid("document_id"),
  userId: uuid("user_id").notNull(),
  position: smallint("position").notNull(),
},t=>[
  primaryKey({ columns: [t.runId,t.position] }),
  // Migration 0041 narrows this to SET NULL (document_id); user_id stays set.
  foreignKey({ columns: [t.documentId,t.userId],foreignColumns: [documents.id,documents.userId],name: "run_document_same_owner_fk" }).onDelete("set null"),
  uniqueIndex("run_document_file_unique").on(t.runId,t.documentId),
  index("run_documents_document_idx").on(t.documentId),
  check("run_document_valid",sql`${t.position} BETWEEN 0 AND 4`),
]);
