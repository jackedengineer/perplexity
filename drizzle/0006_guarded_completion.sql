-- Composite unique targets precede their foreign keys.
CREATE TABLE "message_citations" (
	"run_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"passage_id" uuid NOT NULL,
	"display_number" integer NOT NULL,
	"support_status" varchar(16) DEFAULT 'NOT_CHECKED' NOT NULL,
	CONSTRAINT "message_citations_message_id_display_number_pk" PRIMARY KEY("message_id","display_number"),
	CONSTRAINT "citation_metadata_valid" CHECK ("message_citations"."display_number" BETWEEN 1 AND 5 AND "message_citations"."support_status" = 'NOT_CHECKED')
);
--> statement-breakpoint
CREATE TABLE "output_safety_reviews" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"attempt_version" integer NOT NULL,
	"decision" varchar(16) NOT NULL,
	"policy_version" varchar(32) NOT NULL,
	"message_id" uuid,
	"message_role" "message_role" DEFAULT 'ASSISTANT' NOT NULL,
	"body_hash" varchar(64),
	"payload_hash" varchar(64),
	"payload" jsonb,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "output_review_valid" CHECK ("output_safety_reviews"."attempt_version" > 0 AND "output_safety_reviews"."message_role" = 'ASSISTANT' AND length(trim("output_safety_reviews"."policy_version")) > 0 AND "output_safety_reviews"."decision" IN ('ALLOW','BLOCK','UNAVAILABLE')),
	CONSTRAINT "output_review_content_valid" CHECK (("output_safety_reviews"."decision" = 'ALLOW' AND "output_safety_reviews"."message_id" IS NOT NULL AND "output_safety_reviews"."body_hash" IS NOT NULL AND "output_safety_reviews"."payload_hash" IS NOT NULL AND "output_safety_reviews"."payload" IS NOT NULL AND "output_safety_reviews"."body_hash" ~ '^[a-f0-9]{64}$' AND "output_safety_reviews"."payload_hash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("output_safety_reviews"."payload") = 'object' AND ("output_safety_reviews"."payload"->>'runId') IS NOT DISTINCT FROM "output_safety_reviews"."run_id"::text AND jsonb_typeof("output_safety_reviews"."payload"->'markdown') IS NOT DISTINCT FROM 'string' AND "output_safety_reviews"."body_hash" = encode(sha256(convert_to("output_safety_reviews"."payload"->>'markdown','UTF8')),'hex')) OR ("output_safety_reviews"."decision" <> 'ALLOW' AND "output_safety_reviews"."message_id" IS NULL AND "output_safety_reviews"."body_hash" IS NULL AND "output_safety_reviews"."payload_hash" IS NULL AND "output_safety_reviews"."payload" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "provider_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"stage" varchar(24) NOT NULL,
	"attempt_version" integer NOT NULL,
	"requested_model" varchar(128) NOT NULL,
	"actual_model" varchar(128),
	"cap_micro_usd" bigint NOT NULL,
	"status" varchar(16) NOT NULL,
	"cost_micro_usd" bigint,
	"input_tokens" integer,
	"output_tokens" integer,
	"search_credits" integer,
	"started_at" timestamp (3) with time zone NOT NULL,
	"finished_at" timestamp (3) with time zone,
	CONSTRAINT "provider_attempt_valid" CHECK ("provider_calls"."attempt_version" > 0 AND length(trim("provider_calls"."requested_model")) > 0 AND "provider_calls"."status" IN ('STARTED','SUCCEEDED','UNKNOWN','SKIPPED')),
	CONSTRAINT "provider_cap_valid" CHECK ("provider_calls"."cap_micro_usd" > 0 AND "provider_calls"."cap_micro_usd" = CASE "provider_calls"."stage" WHEN 'INPUT_SAFETY' THEN 5000 WHEN 'QUERY_SAFETY' THEN 5000 WHEN 'SEARCH' THEN 8000 WHEN 'EVIDENCE_SAFETY' THEN 5000 WHEN 'ANSWER' THEN 20000 WHEN 'OUTPUT_SAFETY' THEN 5000 ELSE -1 END),
	CONSTRAINT "provider_usage_valid" CHECK (("provider_calls"."cost_micro_usd" IS NULL OR "provider_calls"."cost_micro_usd" >= 0) AND ("provider_calls"."input_tokens" IS NULL OR "provider_calls"."input_tokens" BETWEEN 0 AND 1000000) AND ("provider_calls"."output_tokens" IS NULL OR "provider_calls"."output_tokens" BETWEEN 0 AND 1000000) AND ("provider_calls"."search_credits" IS NULL OR "provider_calls"."search_credits" = 1)),
	CONSTRAINT "provider_lifecycle_valid" CHECK (("provider_calls"."status" = 'STARTED' AND "provider_calls"."finished_at" IS NULL AND "provider_calls"."cost_micro_usd" IS NULL) OR ("provider_calls"."status" <> 'STARTED' AND "provider_calls"."finished_at" IS NOT NULL AND "provider_calls"."finished_at" >= "provider_calls"."started_at" AND ("provider_calls"."status" <> 'SKIPPED' OR "provider_calls"."cost_micro_usd" IS NOT DISTINCT FROM 0)))
);
--> statement-breakpoint
CREATE TABLE "run_settlements" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"credits_charged" integer NOT NULL,
	"known_provider_micro_usd" bigint NOT NULL,
	"held_provider_micro_usd" bigint NOT NULL,
	"released_provider_micro_usd" bigint NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "settlement_amounts_valid" CHECK ("run_settlements"."credits_charged" BETWEEN 0 AND 15 AND "run_settlements"."known_provider_micro_usd" >= 0 AND "run_settlements"."held_provider_micro_usd" >= 0 AND "run_settlements"."released_provider_micro_usd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "accounting_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "citation_message_source_unique" ON "message_citations" USING btree ("message_id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "output_review_message_unique" ON "output_safety_reviews" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "output_review_run_message_unique" ON "output_safety_reviews" USING btree ("run_id","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_run_stage_unique" ON "provider_calls" USING btree ("run_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "passage_run_source_id_unique" ON "source_passages" USING btree ("run_id","source_id","id");--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "citation_same_run_message_fk" FOREIGN KEY ("run_id","message_id") REFERENCES "public"."output_safety_reviews"("run_id","message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "citation_same_run_source_fk" FOREIGN KEY ("run_id","source_id") REFERENCES "public"."run_sources"("run_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "citation_same_source_passage_fk" FOREIGN KEY ("run_id","source_id","passage_id") REFERENCES "public"."source_passages"("run_id","source_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "output_safety_reviews" ADD CONSTRAINT "output_review_owned_run_fk" FOREIGN KEY ("run_id","conversation_id") REFERENCES "public"."runs"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "output_safety_reviews" ADD CONSTRAINT "output_review_assistant_fk" FOREIGN KEY ("message_id","conversation_id","message_role") REFERENCES "public"."messages"("id","conversation_id","role") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_settlements" ADD CONSTRAINT "run_settlements_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "run_accounting_version_valid" CHECK ("runs"."accounting_version" IN (0,1));--> statement-breakpoint
CREATE POLICY "messages_reviewed_answer_insert" ON "messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    role = 'ASSISTANT' AND kind IN ('ANSWER','CLARIFICATION') AND approved_at IS NOT NULL AND policy_version IS NOT NULL
    AND jsonb_array_length(parts) = 1 AND parts->0->>'type' = 'text'
    AND parts->0 = jsonb_build_object('type','text','text',parts->0->>'text')
    AND EXISTS (SELECT 1 FROM output_safety_reviews review WHERE review.message_id = messages.id
      AND review.conversation_id = messages.conversation_id AND review.decision = 'ALLOW'
      AND review.policy_version = messages.policy_version
      AND review.body_hash = encode(sha256(convert_to(parts->0->>'text','UTF8')),'hex')));
--> statement-breakpoint
ALTER TABLE output_safety_reviews ALTER CONSTRAINT output_review_assistant_fk DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'perplex_web') THEN
    GRANT SELECT, INSERT ON provider_calls, output_safety_reviews, message_citations, run_settlements TO perplex_web;
    GRANT UPDATE (status, actual_model, cost_micro_usd, input_tokens, output_tokens, search_credits, finished_at) ON provider_calls TO perplex_web;
    GRANT UPDATE (settled_credits, settled_provider_micro_usd) ON usage_buckets TO perplex_web;
    GRANT UPDATE (settled_provider_micro_usd) ON operator_usage_buckets TO perplex_web;
  END IF;
END $$;
