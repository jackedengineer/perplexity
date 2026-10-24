CREATE TABLE "run_plans" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"message_role" "message_role" DEFAULT 'USER' NOT NULL,
	"attempt_version" integer NOT NULL,
	"version" varchar(32) NOT NULL,
	"plan" jsonb NOT NULL,
	"context_ids" jsonb NOT NULL,
	"original_hash" varchar(64) NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "plan_metadata_valid" CHECK ("run_plans"."attempt_version">0 AND "run_plans"."message_role"='USER' AND "run_plans"."version"='planner-v1' AND "run_plans"."original_hash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("run_plans"."plan")='object' AND "run_plans"."plan"->>'action' IN ('ANSWER','CLARIFY') AND jsonb_typeof("run_plans"."context_ids")='array' AND jsonb_array_length("run_plans"."context_ids")<=6)
);
--> statement-breakpoint
ALTER TABLE "provider_calls" DROP CONSTRAINT "provider_cap_valid";--> statement-breakpoint
ALTER TABLE "run_plans" ADD CONSTRAINT "plan_owned_run_fk" FOREIGN KEY ("run_id","conversation_id") REFERENCES "public"."runs"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_plans" ADD CONSTRAINT "plan_owned_message_fk" FOREIGN KEY ("message_id","conversation_id","message_role") REFERENCES "public"."messages"("id","conversation_id","role") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_cap_valid" CHECK ("provider_calls"."cap_micro_usd" > 0 AND "provider_calls"."cap_micro_usd" = CASE "provider_calls"."stage" WHEN 'PLANNER' THEN 2000 WHEN 'INPUT_SAFETY' THEN 5000 WHEN 'QUERY_SAFETY' THEN 5000 WHEN 'SEARCH' THEN 8000 WHEN 'EVIDENCE_SAFETY' THEN 5000 WHEN 'ANSWER' THEN 20000 WHEN 'OUTPUT_SAFETY' THEN 5000 ELSE -1 END);--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
  GRANT SELECT,INSERT ON run_plans TO perplex_web;
 END IF;
END $$;
