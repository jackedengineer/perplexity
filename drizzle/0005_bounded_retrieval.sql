-- Composite FK targets must exist before their referencing constraints.
CREATE TABLE "run_retrievals" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"attempt_version" integer NOT NULL,
	"policy_version" varchar(32) NOT NULL,
	"detector_version" varchar(32) NOT NULL,
	"model_id" varchar(128) NOT NULL,
	"status" varchar(24) NOT NULL,
	"query_verdict" varchar(16),
	"evidence_verdict" varchar(16),
	"search_credits" integer,
	"created_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "retrieval_metadata_valid" CHECK ("run_retrievals"."attempt_version" > 0 AND length(trim("run_retrievals"."policy_version")) > 0 AND length(trim("run_retrievals"."detector_version")) > 0 AND length(trim("run_retrievals"."model_id")) > 0 AND "run_retrievals"."expires_at" > "run_retrievals"."created_at"),
	CONSTRAINT "retrieval_outcome_valid" CHECK ("run_retrievals"."status" IN ('STARTED','READY','NO_EVIDENCE','BLOCKED','UNAVAILABLE') AND ("run_retrievals"."query_verdict" IS NULL OR "run_retrievals"."query_verdict" IN ('ALLOW','BLOCK','UNAVAILABLE')) AND ("run_retrievals"."evidence_verdict" IS NULL OR "run_retrievals"."evidence_verdict" IN ('ALLOW','BLOCK','UNAVAILABLE')) AND ("run_retrievals"."search_credits" IS NULL OR "run_retrievals"."search_credits" = 1)),
	CONSTRAINT "retrieval_ready_reviewed" CHECK ("run_retrievals"."status" NOT IN ('READY','NO_EVIDENCE') OR ("run_retrievals"."query_verdict" IS NOT DISTINCT FROM 'ALLOW' AND "run_retrievals"."search_credits" IS NOT DISTINCT FROM 1 AND ("run_retrievals"."status" = 'NO_EVIDENCE' OR "run_retrievals"."evidence_verdict" IS NOT DISTINCT FROM 'ALLOW')))
);
--> statement-breakpoint
CREATE TABLE "run_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"source_key" varchar(3) NOT NULL,
	"url" varchar(2048) NOT NULL,
	"title" varchar(300) NOT NULL,
	"rank" integer NOT NULL,
	"published_at" timestamp (3) with time zone,
	"retrieved_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "source_metadata_valid" CHECK ("run_sources"."source_key" ~ '^S[1-5]$' AND "run_sources"."rank" BETWEEN 1 AND 5 AND length(trim("run_sources"."title")) > 0 AND "run_sources"."url" ~ '^https?://')
);
--> statement-breakpoint
ALTER TABLE "run_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "source_passages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"excerpt" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"content_kind" varchar(24) NOT NULL,
	CONSTRAINT "passage_content_valid" CHECK (length("source_passages"."excerpt") BETWEEN 1 AND 1000 AND length(trim("source_passages"."excerpt")) > 0 AND "source_passages"."content_kind" = 'SEARCH_PASSAGE' AND "source_passages"."content_hash" = encode(sha256(convert_to("source_passages"."excerpt",'UTF8')),'hex'))
);
--> statement-breakpoint
ALTER TABLE "source_passages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "source_run_key_unique" ON "run_sources" USING btree ("run_id","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "source_run_url_unique" ON "run_sources" USING btree ("run_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "source_run_id_unique" ON "run_sources" USING btree ("run_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "passage_source_unique" ON "source_passages" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passage_run_id_unique" ON "source_passages" USING btree ("run_id","id");--> statement-breakpoint
ALTER TABLE "run_retrievals" ADD CONSTRAINT "run_retrievals_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_sources" ADD CONSTRAINT "run_sources_run_id_run_retrievals_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run_retrievals"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_passages" ADD CONSTRAINT "passage_same_run_source_fk" FOREIGN KEY ("run_id","source_id") REFERENCES "public"."run_sources"("run_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "sources_runtime_read" ON "run_sources" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "sources_reviewed_insert" ON "run_sources" AS PERMISSIVE FOR INSERT TO public WITH CHECK (EXISTS (SELECT 1 FROM run_retrievals r WHERE r.run_id = "run_sources"."run_id" AND r.status = 'READY' AND r.query_verdict = 'ALLOW' AND r.evidence_verdict = 'ALLOW'));--> statement-breakpoint
CREATE POLICY "passages_runtime_read" ON "source_passages" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "passages_reviewed_insert" ON "source_passages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (EXISTS (SELECT 1 FROM run_retrievals r WHERE r.run_id = "source_passages"."run_id" AND r.status = 'READY' AND r.query_verdict = 'ALLOW' AND r.evidence_verdict = 'ALLOW'));
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'perplex_web') THEN
    GRANT SELECT, INSERT ON run_retrievals, run_sources, source_passages TO perplex_web;
    GRANT UPDATE (status, query_verdict, evidence_verdict, search_credits) ON run_retrievals TO perplex_web;
  END IF;
END $$;
