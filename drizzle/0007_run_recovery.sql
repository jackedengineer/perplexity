CREATE TABLE "provider_usage_resolutions" (
	"call_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"cost_micro_usd" bigint NOT NULL,
	"kind" varchar(24) NOT NULL,
	"evidence_hash" varchar(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_resolution_valid" CHECK ("provider_usage_resolutions"."cost_micro_usd" BETWEEN 0 AND 150000 AND "provider_usage_resolutions"."kind" IN ('PROVIDER_RECEIPT','VERIFIED_NOT_BILLED') AND ("provider_usage_resolutions"."kind" <> 'VERIFIED_NOT_BILLED' OR "provider_usage_resolutions"."cost_micro_usd"=0) AND "provider_usage_resolutions"."evidence_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "run_reconciliations" (
	"run_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"previous_held_micro_usd" bigint NOT NULL,
	"charged_micro_usd" bigint NOT NULL,
	"released_micro_usd" bigint NOT NULL,
	"remaining_held_micro_usd" bigint NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_reconciliations_run_id_version_pk" PRIMARY KEY("run_id","version"),
	CONSTRAINT "reconciliation_amounts_valid" CHECK ("run_reconciliations"."version">0 AND "run_reconciliations"."charged_micro_usd">=0 AND "run_reconciliations"."released_micro_usd">=0 AND "run_reconciliations"."remaining_held_micro_usd">=0 AND "run_reconciliations"."previous_held_micro_usd"="run_reconciliations"."charged_micro_usd"+"run_reconciliations"."released_micro_usd"+"run_reconciliations"."remaining_held_micro_usd" AND "run_reconciliations"."charged_micro_usd"+"run_reconciliations"."released_micro_usd">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_id_run_unique" ON "provider_calls" USING btree ("id","run_id");
--> statement-breakpoint
ALTER TABLE "provider_usage_resolutions" ADD CONSTRAINT "usage_resolution_call_run_fk" FOREIGN KEY ("call_id","run_id") REFERENCES "public"."provider_calls"("id","run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_reconciliations" ADD CONSTRAINT "run_reconciliations_run_id_run_settlements_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run_settlements"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_run_hold_unique" ON "run_reconciliations" USING btree ("run_id","previous_held_micro_usd");--> statement-breakpoint

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
  GRANT SELECT ON provider_usage_resolutions TO perplex_web;
  GRANT SELECT, INSERT ON run_reconciliations TO perplex_web;
 END IF;
END $$;
