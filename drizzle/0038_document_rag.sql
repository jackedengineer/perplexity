CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"page" integer NOT NULL,
	"text" text NOT NULL,
	"search_text" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', text)) STORED NOT NULL,
	"embedding" vector(1536),
	"embedding_model" varchar(128),
	"lease_until" timestamp (3) with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_chunk_valid" CHECK ("document_chunks"."ordinal" >= 0 AND "document_chunks"."page" >= 1 AND length("document_chunks"."text") BETWEEN 1 AND 1000 AND length(trim("document_chunks"."text")) > 0 AND ("document_chunks"."embedding" IS NULL) = ("document_chunks"."embedding_model" IS NULL) AND "document_chunks"."attempts" BETWEEN 0 AND 10)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"storage_key" varchar(200) NOT NULL,
	"byte_size" integer NOT NULL,
	"page_count" integer NOT NULL,
	"status" varchar(16) NOT NULL,
	"failure_code" varchar(32),
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"embedded_count" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "documents_valid" CHECK (length(trim("documents"."title")) > 0 AND "documents"."content_hash" ~ '^[a-f0-9]{64}$' AND "documents"."byte_size" > 0 AND "documents"."page_count" >= 0 AND "documents"."status" IN ('PROCESSING','READY','FAILED') AND ("documents"."status" = 'FAILED') = ("documents"."failure_code" IS NOT NULL) AND "documents"."chunk_count" >= 0 AND "documents"."embedded_count" BETWEEN 0 AND "documents"."chunk_count" AND "documents"."cost_micro_usd" >= 0 AND ("documents"."status" <> 'READY' OR "documents"."embedded_count" = "documents"."chunk_count"))
);
--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_snapshot_valid";--> statement-breakpoint
ALTER TABLE "run_retrievals" DROP CONSTRAINT "retrieval_outcome_valid";--> statement-breakpoint
ALTER TABLE "run_retrievals" DROP CONSTRAINT "retrieval_ready_reviewed";--> statement-breakpoint
ALTER TABLE "source_passages" DROP CONSTRAINT "passage_content_valid";--> statement-breakpoint
ALTER TABLE "provider_calls" DROP CONSTRAINT "provider_cap_valid";--> statement-breakpoint
ALTER TABLE "run_retrievals" ADD COLUMN "source_kind" varchar(16) DEFAULT 'WEB' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunk_ordinal_unique" ON "document_chunks" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE INDEX "document_chunks_owner_idx" ON "document_chunks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_chunks_pending_idx" ON "document_chunks" USING btree ("document_id") WHERE "document_chunks"."embedding" IS NULL;--> statement-breakpoint
CREATE INDEX "document_chunks_search_idx" ON "document_chunks" USING gin ("search_text");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_owner_content_unique" ON "documents" USING btree ("user_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_owner_id_unique" ON "documents" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "chunk_same_owner_document_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."documents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_owner_created_idx" ON "documents" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_snapshot_valid" CHECK ("runs"."mode" IN ('FAST','CHAT','DOCUMENTS') AND "runs"."payload_version" = 1 AND "runs"."answer_credits" > 0 AND "runs"."provider_reserve_micro_usd" > 0 AND "runs"."admitted_revision" > 0 AND "runs"."attempt_version" > 0);--> statement-breakpoint
ALTER TABLE "run_retrievals" ADD CONSTRAINT "retrieval_outcome_valid" CHECK ("run_retrievals"."status" IN ('STARTED','READY','NO_EVIDENCE','BLOCKED','UNAVAILABLE') AND ("run_retrievals"."query_verdict" IS NULL OR "run_retrievals"."query_verdict" IN ('ALLOW','BLOCK','UNAVAILABLE')) AND ("run_retrievals"."evidence_verdict" IS NULL OR "run_retrievals"."evidence_verdict" IN ('ALLOW','BLOCK','UNAVAILABLE')) AND ("run_retrievals"."search_credits" IS NULL OR "run_retrievals"."search_credits" BETWEEN 1 AND 2) AND "run_retrievals"."source_kind" IN ('WEB','DOCUMENTS') AND ("run_retrievals"."source_kind" = 'WEB' OR "run_retrievals"."search_credits" IS NULL));--> statement-breakpoint
ALTER TABLE "run_retrievals" ADD CONSTRAINT "retrieval_ready_reviewed" CHECK ("run_retrievals"."status" NOT IN ('READY','NO_EVIDENCE') OR ("run_retrievals"."query_verdict" IS NOT DISTINCT FROM 'ALLOW' AND ("run_retrievals"."source_kind" = 'DOCUMENTS' OR coalesce("run_retrievals"."search_credits",0) BETWEEN 1 AND 2) AND ("run_retrievals"."status" = 'NO_EVIDENCE' OR "run_retrievals"."evidence_verdict" IS NOT DISTINCT FROM 'ALLOW')));--> statement-breakpoint
ALTER TABLE "source_passages" ADD CONSTRAINT "passage_content_valid" CHECK (length("source_passages"."excerpt") BETWEEN 1 AND 1000 AND length(trim("source_passages"."excerpt")) > 0 AND "source_passages"."content_kind" IN ('SEARCH_PASSAGE','EXTRACTED_PAGE','DOCUMENT_PAGE') AND "source_passages"."content_hash" = encode(sha256(convert_to("source_passages"."excerpt",'UTF8')),'hex'));--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_cap_valid" CHECK ("provider_calls"."cap_micro_usd" > 0 AND "provider_calls"."cap_micro_usd" = CASE WHEN "provider_calls"."budget_version"=1 THEN CASE "provider_calls"."stage" WHEN 'PLANNER' THEN 2000 WHEN 'INPUT_SAFETY' THEN 5000 WHEN 'QUERY_SAFETY' THEN 5000 WHEN 'SEARCH' THEN 8000 WHEN 'EVIDENCE_SAFETY' THEN 5000 WHEN 'ANSWER' THEN 20000 WHEN 'OUTPUT_SAFETY' THEN 5000 ELSE -1 END WHEN "provider_calls"."budget_version" IN (2,3) THEN CASE "provider_calls"."stage" WHEN 'PLANNER' THEN 2000 WHEN 'INPUT_SAFETY' THEN 2250 WHEN 'QUERY_SAFETY' THEN 2250 WHEN 'QUERY_SECOND' THEN 2250 WHEN 'SEARCH' THEN 8000 WHEN 'SEARCH_SECOND' THEN 8000 WHEN 'EXTRACT' THEN 8000 WHEN 'EVIDENCE_SAFETY' THEN 2250 WHEN 'ANSWER' THEN CASE WHEN "provider_calls"."budget_version"=3 THEN 48000 ELSE 12500 END WHEN 'OUTPUT_SAFETY' THEN 2250 WHEN 'QUERY_EMBEDDING' THEN 100 ELSE -1 END ELSE -1 END);--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON documents, document_chunks TO perplex_web;
  END IF;
END $$;
