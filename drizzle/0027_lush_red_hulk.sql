-- Reviewed ordering: referenced unique indexes must exist before compound FKs.
CREATE UNIQUE INDEX "job_period_id_owner" ON "job_periods" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_subscription_owner" ON "billing_checkouts" USING btree ("subscription_id","user_id");--> statement-breakpoint
ALTER TABLE "job_reservations" ADD COLUMN "budget_key" varchar(64);--> statement-breakpoint
UPDATE job_reservations r SET budget_key=b.budget_key FROM operator_usage_buckets b WHERE b.id=r.operator_period_id;--> statement-breakpoint
ALTER TABLE job_reservations ALTER COLUMN budget_key SET NOT NULL;--> statement-breakpoint
ALTER TABLE "job_reservations" ADD COLUMN "period_kind" "budget_kind" DEFAULT 'PERIOD' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_reservations" ADD COLUMN "day_kind" "budget_kind" DEFAULT 'DAY' NOT NULL;--> statement-breakpoint
ALTER TABLE "durable_jobs" ADD CONSTRAINT "job_paid_period_owner" FOREIGN KEY ("period_id","user_id") REFERENCES "public"."job_periods"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_periods" ADD CONSTRAINT "job_period_paid_checkout_owner" FOREIGN KEY ("subscription_id","user_id") REFERENCES "public"."billing_checkouts"("subscription_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_reservations" ADD CONSTRAINT "job_operator_period_snapshot" FOREIGN KEY ("operator_period_id","budget_key","period_kind") REFERENCES "public"."operator_usage_buckets"("id","budget_key","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_reservations" ADD CONSTRAINT "job_operator_day_snapshot" FOREIGN KEY ("operator_day_id","budget_key","day_kind") REFERENCES "public"."operator_usage_buckets"("id","budget_key","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_reservations" ADD CONSTRAINT "job_reservation_kinds" CHECK ("job_reservations"."period_kind"='PERIOD' AND "job_reservations"."day_kind"='DAY');