CREATE TYPE "public"."memory_kind" AS ENUM('PROFILE', 'PREFERENCE', 'CONTEXT');--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "memory_kind" NOT NULL,
	"text" varchar(200) NOT NULL,
	"source_message_id" uuid,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "memories_valid" CHECK (length(trim("memories"."text")) BETWEEN 3 AND 200)
);
--> statement-breakpoint
CREATE TABLE "memory_extractions" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(16) NOT NULL,
	"model" varchar(128) NOT NULL,
	"cost_micro_usd" bigint,
	"operations" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"finished_at" timestamp (3) with time zone,
	CONSTRAINT "memory_extractions_valid" CHECK ("memory_extractions"."status" IN ('STARTED','SUCCEEDED','FAILED','UNKNOWN') AND "memory_extractions"."operations" BETWEEN 0 AND 3 AND ("memory_extractions"."cost_micro_usd" IS NULL OR "memory_extractions"."cost_micro_usd" >= 0) AND ("memory_extractions"."status" = 'STARTED') = ("memory_extractions"."finished_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "memory_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"instructions" varchar(1000),
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "memory_settings_valid" CHECK ("memory_settings"."instructions" IS NULL OR length(trim("memory_settings"."instructions")) > 0)
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "memory_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_extractions" ADD CONSTRAINT "memory_extractions_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_extractions" ADD CONSTRAINT "memory_extractions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_settings" ADD CONSTRAINT "memory_settings_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memories_owner_text_unique" ON "memories" USING btree ("user_id",lower(regexp_replace(trim("text"), '\s+', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "memories_owner_created_idx" ON "memories" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "memory_extractions_owner_created_idx" ON "memory_extractions" USING btree ("user_id","created_at");--> statement-breakpoint
-- Memories can be rewritten only in their content columns; settings only in their own fields.
-- The extraction ledger can only advance its outcome.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
    GRANT SELECT, INSERT, DELETE ON memories TO perplex_web;
    GRANT UPDATE (kind, text, updated_at) ON memories TO perplex_web;
    GRANT SELECT, INSERT ON memory_settings TO perplex_web;
    GRANT UPDATE (paused, instructions, updated_at) ON memory_settings TO perplex_web;
    GRANT SELECT, INSERT ON memory_extractions TO perplex_web;
    GRANT UPDATE (status, model, cost_micro_usd, operations, finished_at) ON memory_extractions TO perplex_web;
  END IF;
END $$;
