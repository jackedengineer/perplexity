-- Composite FK targets require their unique indexes before ALTER TABLE.
CREATE TYPE "public"."attempt_kind" AS ENUM('MINUTE', 'DAY');--> statement-breakpoint
CREATE TYPE "public"."budget_kind" AS ENUM('PERIOD', 'DAY');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('RECEIVED', 'CHECKING_INPUT', 'PLANNING', 'SEARCHING', 'PREPARING_EVIDENCE', 'GENERATING', 'CHECKING_OUTPUT', 'COMPLETED', 'NEEDS_CLARIFICATION', 'BLOCKED', 'FAILED', 'CANCELLED', 'TIMED_OUT');--> statement-breakpoint
CREATE TABLE "admission_attempt_buckets" (
	"user_id" uuid NOT NULL,
	"kind" "attempt_kind" NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "admission_attempt_count_valid" CHECK ("admission_attempt_buckets"."attempts" >= 0),
	CONSTRAINT "admission_attempt_window_valid" CHECK (("admission_attempt_buckets"."kind" = 'MINUTE' AND "admission_attempt_buckets"."ends_at" = "admission_attempt_buckets"."starts_at" + interval '1 minute') OR ("admission_attempt_buckets"."kind" = 'DAY' AND "admission_attempt_buckets"."ends_at" = "admission_attempt_buckets"."starts_at" + interval '1 day'))
);
--> statement-breakpoint
CREATE TABLE "operator_usage_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_key" varchar(64) NOT NULL,
	"kind" "budget_kind" NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"provider_limit_micro_usd" bigint NOT NULL,
	"reserved_provider_micro_usd" bigint DEFAULT 0 NOT NULL,
	"settled_provider_micro_usd" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "operator_bucket_window_valid" CHECK ("operator_usage_buckets"."ends_at" > "operator_usage_buckets"."starts_at" AND length(trim("operator_usage_buckets"."budget_key")) > 0),
	CONSTRAINT "operator_bucket_provider_valid" CHECK ("operator_usage_buckets"."provider_limit_micro_usd" >= 0 AND "operator_usage_buckets"."reserved_provider_micro_usd" >= 0 AND "operator_usage_buckets"."settled_provider_micro_usd" >= 0 AND "operator_usage_buckets"."reserved_provider_micro_usd" + "operator_usage_buckets"."settled_provider_micro_usd" <= "operator_usage_buckets"."provider_limit_micro_usd")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"payload_hmac" varchar(64) NOT NULL,
	"hmac_key_id" varchar(32) NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"mode" varchar(16) DEFAULT 'FAST' NOT NULL,
	"model_key" varchar(64) DEFAULT 'fast-default' NOT NULL,
	"policy_version" varchar(32) DEFAULT 'v1' NOT NULL,
	"catalog_version" varchar(64) NOT NULL,
	"price_version" varchar(64) NOT NULL,
	"entitlement_version" varchar(64) NOT NULL,
	"operator_budget_key" varchar(64) NOT NULL,
	"answer_credits" integer NOT NULL,
	"provider_reserve_micro_usd" bigint NOT NULL,
	"admitted_revision" integer NOT NULL,
	"attempt_version" integer DEFAULT 1 NOT NULL,
	"status" "run_status" DEFAULT 'RECEIVED' NOT NULL,
	"deadline_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_hmac_shape" CHECK ("runs"."payload_hmac" ~ '^[a-f0-9]{64}$' AND length("runs"."payload_hmac") = 64),
	CONSTRAINT "runs_snapshot_valid" CHECK ("runs"."mode" = 'FAST' AND "runs"."payload_version" = 1 AND "runs"."answer_credits" > 0 AND "runs"."provider_reserve_micro_usd" > 0 AND "runs"."admitted_revision" > 0 AND "runs"."attempt_version" > 0),
	CONSTRAINT "runs_versions_nonempty" CHECK (length(trim("runs"."hmac_key_id")) > 0 AND length(trim("runs"."catalog_version")) > 0 AND length(trim("runs"."price_version")) > 0 AND length(trim("runs"."entitlement_version")) > 0 AND length(trim("runs"."operator_budget_key")) > 0 AND length(trim("runs"."policy_version")) > 0 AND length(trim("runs"."model_key")) > 0),
	CONSTRAINT "runs_deadline_valid" CHECK ("runs"."deadline_at" > "runs"."created_at")
);
--> statement-breakpoint
CREATE TABLE "usage_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "budget_kind" NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"entitlement_version" varchar(64) NOT NULL,
	"credit_limit" integer NOT NULL,
	"reserved_credits" integer DEFAULT 0 NOT NULL,
	"settled_credits" integer DEFAULT 0 NOT NULL,
	"provider_limit_micro_usd" bigint NOT NULL,
	"reserved_provider_micro_usd" bigint DEFAULT 0 NOT NULL,
	"settled_provider_micro_usd" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_bucket_window_valid" CHECK ("usage_buckets"."ends_at" > "usage_buckets"."starts_at" AND length(trim("usage_buckets"."entitlement_version")) > 0),
	CONSTRAINT "usage_bucket_credits_valid" CHECK ("usage_buckets"."credit_limit" >= 0 AND "usage_buckets"."reserved_credits" >= 0 AND "usage_buckets"."settled_credits" >= 0 AND "usage_buckets"."reserved_credits" + "usage_buckets"."settled_credits" <= "usage_buckets"."credit_limit"),
	CONSTRAINT "usage_bucket_provider_valid" CHECK ("usage_buckets"."provider_limit_micro_usd" >= 0 AND "usage_buckets"."reserved_provider_micro_usd" >= 0 AND "usage_buckets"."settled_provider_micro_usd" >= 0 AND "usage_buckets"."reserved_provider_micro_usd" + "usage_buckets"."settled_provider_micro_usd" <= "usage_buckets"."provider_limit_micro_usd")
);
--> statement-breakpoint
CREATE TABLE "usage_reservations" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"operator_budget_key" varchar(64) NOT NULL,
	"period_bucket_id" uuid NOT NULL,
	"day_bucket_id" uuid NOT NULL,
	"operator_period_bucket_id" uuid NOT NULL,
	"operator_day_bucket_id" uuid NOT NULL,
	"period_kind" "budget_kind" DEFAULT 'PERIOD' NOT NULL,
	"day_kind" "budget_kind" DEFAULT 'DAY' NOT NULL,
	"answer_credits" integer NOT NULL,
	"provider_reserve_micro_usd" bigint NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_kinds_valid" CHECK ("usage_reservations"."period_kind" = 'PERIOD' AND "usage_reservations"."day_kind" = 'DAY')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admission_attempt_window_unique" ON "admission_attempt_buckets" USING btree ("user_id","kind","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_bucket_window_unique" ON "operator_usage_buckets" USING btree ("budget_key","kind","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_bucket_key_kind_unique" ON "operator_usage_buckets" USING btree ("id","budget_key","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_owner_intent_unique" ON "runs" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_snapshot_unique" ON "runs" USING btree ("id","user_id","operator_budget_key","answer_credits","provider_reserve_micro_usd");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_active_owner_unique" ON "runs" USING btree ("user_id") WHERE "runs"."status" IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT');--> statement-breakpoint
CREATE UNIQUE INDEX "runs_active_conversation_unique" ON "runs" USING btree ("conversation_id") WHERE "runs"."status" IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT');--> statement-breakpoint
CREATE INDEX "runs_status_deadline_idx" ON "runs" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_bucket_window_unique" ON "usage_buckets" USING btree ("user_id","kind","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_bucket_owner_kind_unique" ON "usage_buckets" USING btree ("id","user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_owner_unique" ON "conversations" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "admission_attempt_buckets" ADD CONSTRAINT "admission_attempt_buckets_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_owned_conversation_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_buckets" ADD CONSTRAINT "usage_buckets_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "reservation_run_snapshot_fk" FOREIGN KEY ("run_id","user_id","operator_budget_key","answer_credits","provider_reserve_micro_usd") REFERENCES "public"."runs"("id","user_id","operator_budget_key","answer_credits","provider_reserve_micro_usd") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "reservation_user_period_fk" FOREIGN KEY ("period_bucket_id","user_id","period_kind") REFERENCES "public"."usage_buckets"("id","user_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "reservation_user_day_fk" FOREIGN KEY ("day_bucket_id","user_id","day_kind") REFERENCES "public"."usage_buckets"("id","user_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "reservation_operator_period_fk" FOREIGN KEY ("operator_period_bucket_id","operator_budget_key","period_kind") REFERENCES "public"."operator_usage_buckets"("id","budget_key","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "reservation_operator_day_fk" FOREIGN KEY ("operator_day_bucket_id","operator_budget_key","day_kind") REFERENCES "public"."operator_usage_buckets"("id","budget_key","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'perplex_web') THEN
    GRANT SELECT, INSERT ON runs, usage_reservations, admission_attempt_buckets TO perplex_web;
    GRANT UPDATE (status, updated_at, attempt_version) ON runs TO perplex_web;
    GRANT UPDATE (attempts) ON admission_attempt_buckets TO perplex_web;
    GRANT SELECT ON usage_buckets, operator_usage_buckets TO perplex_web;
    GRANT UPDATE (reserved_credits, reserved_provider_micro_usd) ON usage_buckets TO perplex_web;
    GRANT UPDATE (reserved_provider_micro_usd) ON operator_usage_buckets TO perplex_web;
  END IF;
END $$;
--> statement-breakpoint
-- Deferred child checks allow one auth-user cascade to delete both runs and user budgets.
ALTER TABLE "usage_reservations" ALTER CONSTRAINT "reservation_user_period_fk" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "usage_reservations" ALTER CONSTRAINT "reservation_user_day_fk" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "usage_reservations" ALTER CONSTRAINT "reservation_operator_period_fk" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "usage_reservations" ALTER CONSTRAINT "reservation_operator_day_fk" DEFERRABLE INITIALLY DEFERRED;
