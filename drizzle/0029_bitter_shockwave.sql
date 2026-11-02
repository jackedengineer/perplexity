ALTER TABLE "job_periods" DROP CONSTRAINT "job_period_valid";--> statement-breakpoint
ALTER TABLE "billing_checkouts" DROP CONSTRAINT "checkout_test_plan_valid";--> statement-breakpoint
ALTER TABLE "billing_inbox" DROP CONSTRAINT "billing_inbox_valid";--> statement-breakpoint
ALTER TABLE "job_periods" DROP CONSTRAINT "job_period_paid_checkout_owner";
--> statement-breakpoint
DROP INDEX "job_period_owner_window";--> statement-breakpoint
DROP INDEX "checkout_owner_intent";--> statement-breakpoint
DROP INDEX "checkout_one_open_owner";--> statement-breakpoint
DROP INDEX "checkout_reconcile";--> statement-breakpoint
DROP INDEX "billing_inbox_due";--> statement-breakpoint
ALTER TABLE "billing_inbox" DROP CONSTRAINT "billing_inbox_pkey";--> statement-breakpoint
ALTER TABLE "billing_reversals" DROP CONSTRAINT "billing_reversals_pkey";--> statement-breakpoint
ALTER TABLE "billing_inbox" ADD COLUMN "environment" varchar(8) DEFAULT 'TEST' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_reversals" ADD COLUMN "environment" varchar(8) DEFAULT 'TEST' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_subscription_owner_mode" ON "billing_checkouts" USING btree ("subscription_id","user_id","environment");--> statement-breakpoint
ALTER TABLE "billing_inbox" ADD CONSTRAINT "billing_inbox_environment_event_id_pk" PRIMARY KEY("environment","event_id");--> statement-breakpoint
ALTER TABLE "billing_reversals" ADD CONSTRAINT "billing_reversals_environment_payment_id_pk" PRIMARY KEY("environment","payment_id");--> statement-breakpoint
ALTER TABLE "job_periods" ADD CONSTRAINT "job_period_paid_checkout_owner" FOREIGN KEY ("subscription_id","user_id","environment") REFERENCES "public"."billing_checkouts"("subscription_id","user_id","environment") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_period_owner_window" ON "job_periods" USING btree ("user_id","environment","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_owner_intent" ON "billing_checkouts" USING btree ("user_id","environment","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_one_open_owner" ON "billing_checkouts" USING btree ("user_id","environment") WHERE "billing_checkouts"."state" IN ('CREATING','READY','UNKNOWN');--> statement-breakpoint
CREATE INDEX "checkout_reconcile" ON "billing_checkouts" USING btree ("environment","state","updated_at");--> statement-breakpoint
CREATE INDEX "billing_inbox_due" ON "billing_inbox" USING btree ("environment","state","available_at");--> statement-breakpoint
ALTER TABLE "job_periods" ADD CONSTRAINT "job_period_valid" CHECK ((("job_periods"."environment"='TEST' AND "job_periods"."job_limit" BETWEEN 1 AND 100) OR ("job_periods"."environment"='LIVE' AND "job_periods"."job_limit"=7)) AND "job_periods"."ends_at">"job_periods"."starts_at" AND "job_periods"."state" IN ('ACTIVE','REVOKED') AND "job_periods"."reserved_jobs">=0 AND "job_periods"."spent_jobs">=0 AND "job_periods"."reserved_jobs"+"job_periods"."spent_jobs"<="job_periods"."job_limit");--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "checkout_plan_valid" CHECK ((("billing_checkouts"."environment"='TEST' AND "billing_checkouts"."price_key"='pro-monthly-inr-v1') OR ("billing_checkouts"."environment"='LIVE' AND "billing_checkouts"."price_key"='pro-live-monthly-inr-v1')) AND "billing_checkouts"."state" IN ('CREATING','READY','UNKNOWN','CANCELLED','COMPLETED'));--> statement-breakpoint
ALTER TABLE "billing_inbox" ADD CONSTRAINT "billing_inbox_valid" CHECK ("billing_inbox"."environment" IN ('TEST','LIVE') AND "billing_inbox"."body_hash" ~ '^[a-f0-9]{64}$' AND "billing_inbox"."state" IN ('PENDING','PROCESSING','APPLIED','ATTENTION') AND "billing_inbox"."attempts" BETWEEN 0 AND 10);--> statement-breakpoint
ALTER TABLE "billing_reversals" ADD CONSTRAINT "billing_reversal_mode" CHECK ("billing_reversals"."environment" IN ('TEST','LIVE'));