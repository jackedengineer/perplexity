CREATE TABLE "durable_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"workflow" varchar(64) NOT NULL,
	"period_id" uuid NOT NULL,
	"state" varchar(16) DEFAULT 'QUEUED' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp (3) with time zone,
	"next_event" integer DEFAULT 1 NOT NULL,
	"deadline_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_snapshot_valid" CHECK ("durable_jobs"."workflow"='execution-check-v1' AND "durable_jobs"."fingerprint" ~ '^[a-f0-9]{64}$' AND "durable_jobs"."generation">=0 AND "durable_jobs"."next_event">0 AND "durable_jobs"."deadline_at">"durable_jobs"."created_at" AND "durable_jobs"."state" IN ('QUEUED','RUNNING','COMPLETED','CANCELLED','FAILED','EXPIRED'))
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"job_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"step" varchar(64),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_events_job_id_sequence_pk" PRIMARY KEY("job_id","sequence"),
	CONSTRAINT "job_event_valid" CHECK ("job_events"."sequence">0 AND "job_events"."code" IN ('QUEUED','RUNNING','STEP_STARTED','STEP_COMPLETED','RECOVERED','CANCELLED','COMPLETED','FAILED','EXPIRED','COST_UNKNOWN'))
);
--> statement-breakpoint
CREATE TABLE "job_outbox" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp (3) with time zone,
	"available_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_outbox_valid" CHECK ("job_outbox"."revision">0 AND "job_outbox"."attempts" BETWEEN 0 AND 20 AND "job_outbox"."state" IN ('PENDING','DISPATCHING','DELIVERED'))
);
--> statement-breakpoint
CREATE TABLE "job_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"environment" varchar(8) NOT NULL,
	"payment_id" varchar(80) NOT NULL,
	"invoice_id" varchar(80) NOT NULL,
	"subscription_id" varchar(80) NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"state" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"job_limit" integer NOT NULL,
	"reserved_jobs" integer DEFAULT 0 NOT NULL,
	"spent_jobs" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "job_periods_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "job_periods_invoice_id_unique" UNIQUE("invoice_id"),
	CONSTRAINT "job_period_valid" CHECK ("job_periods"."environment"='TEST' AND "job_periods"."ends_at">"job_periods"."starts_at" AND "job_periods"."state" IN ('ACTIVE','REVOKED') AND "job_periods"."job_limit" BETWEEN 1 AND 100 AND "job_periods"."reserved_jobs">=0 AND "job_periods"."spent_jobs">=0 AND "job_periods"."reserved_jobs"+"job_periods"."spent_jobs"<="job_periods"."job_limit")
);
--> statement-breakpoint
CREATE TABLE "job_reservations" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"operator_period_id" uuid NOT NULL,
	"operator_day_id" uuid NOT NULL,
	"reserved_micro_usd" bigint NOT NULL,
	"spent_micro_usd" bigint DEFAULT 0 NOT NULL,
	"held_micro_usd" bigint DEFAULT 0 NOT NULL,
	"settled_at" timestamp (3) with time zone,
	CONSTRAINT "job_reservation_valid" CHECK ("job_reservations"."operator_period_id"<>"job_reservations"."operator_day_id" AND "job_reservations"."reserved_micro_usd">=0 AND "job_reservations"."spent_micro_usd">=0 AND "job_reservations"."held_micro_usd">=0 AND "job_reservations"."spent_micro_usd"+"job_reservations"."held_micro_usd"<="job_reservations"."reserved_micro_usd")
);
--> statement-breakpoint
CREATE TABLE "job_steps" (
	"job_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"cap_micro_usd" bigint NOT NULL,
	"state" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"generation" integer,
	"cost_micro_usd" bigint,
	"started_at" timestamp (3) with time zone,
	"finished_at" timestamp (3) with time zone,
	CONSTRAINT "job_steps_job_id_key_pk" PRIMARY KEY("job_id","key"),
	CONSTRAINT "job_step_valid" CHECK ("job_steps"."kind" IN ('SYSTEM','MODEL','SEARCH','BROWSER') AND "job_steps"."cap_micro_usd">=0 AND ("job_steps"."kind"<>'SYSTEM' OR "job_steps"."cap_micro_usd"=0) AND "job_steps"."state" IN ('PENDING','STARTED','SUCCEEDED','UNKNOWN','SKIPPED') AND ("job_steps"."cost_micro_usd" IS NULL OR "job_steps"."cost_micro_usd" BETWEEN 0 AND "job_steps"."cap_micro_usd") AND ("job_steps"."state"<>'SUCCEEDED' OR "job_steps"."cost_micro_usd" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "durable_jobs" ADD CONSTRAINT "durable_jobs_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "durable_jobs" ADD CONSTRAINT "durable_jobs_period_id_job_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."job_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_durable_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."durable_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_outbox" ADD CONSTRAINT "job_outbox_job_id_durable_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."durable_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_periods" ADD CONSTRAINT "job_periods_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_reservations" ADD CONSTRAINT "job_reservations_job_id_durable_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."durable_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_reservations" ADD CONSTRAINT "job_reservations_operator_period_id_operator_usage_buckets_id_fk" FOREIGN KEY ("operator_period_id") REFERENCES "public"."operator_usage_buckets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_reservations" ADD CONSTRAINT "job_reservations_operator_day_id_operator_usage_buckets_id_fk" FOREIGN KEY ("operator_day_id") REFERENCES "public"."operator_usage_buckets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_steps" ADD CONSTRAINT "job_steps_job_id_durable_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."durable_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_owner_intent" ON "durable_jobs" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_one_active_owner" ON "durable_jobs" USING btree ("user_id") WHERE "durable_jobs"."state" IN ('QUEUED','RUNNING');--> statement-breakpoint
CREATE INDEX "job_recovery_scan" ON "durable_jobs" USING btree ("state","lease_until","deadline_at");--> statement-breakpoint
CREATE INDEX "job_outbox_dispatch" ON "job_outbox" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "job_period_owner_window" ON "job_periods" USING btree ("user_id","ends_at");