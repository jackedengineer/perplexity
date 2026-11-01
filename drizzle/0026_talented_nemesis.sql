CREATE TABLE "billing_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"plan_id" varchar(80) NOT NULL,
	"price_key" varchar(32) NOT NULL,
	"environment" varchar(8) NOT NULL,
	"subscription_id" varchar(80),
	"state" varchar(16) NOT NULL,
	"provider_state" varchar(32),
	"cancel_at_cycle_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_checkouts_subscription_id_unique" UNIQUE("subscription_id"),
	CONSTRAINT "checkout_test_plan_valid" CHECK ("billing_checkouts"."environment"='TEST' AND "billing_checkouts"."price_key"='pro-monthly-inr-v1' AND "billing_checkouts"."state" IN ('CREATING','READY','UNKNOWN','CANCELLED','COMPLETED'))
);
--> statement-breakpoint
CREATE TABLE "billing_inbox" (
	"event_id" varchar(100) PRIMARY KEY NOT NULL,
	"body_hash" varchar(64) NOT NULL,
	"kind" varchar(64) NOT NULL,
	"subscription_id" varchar(80),
	"payment_id" varchar(80),
	"state" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp (3) with time zone,
	"available_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_inbox_valid" CHECK ("billing_inbox"."body_hash" ~ '^[a-f0-9]{64}$' AND "billing_inbox"."state" IN ('PENDING','PROCESSING','APPLIED','ATTENTION') AND "billing_inbox"."attempts" BETWEEN 0 AND 10)
);
--> statement-breakpoint
CREATE TABLE "billing_reversals" (
	"payment_id" varchar(80) PRIMARY KEY NOT NULL,
	"reason" varchar(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_owner_intent" ON "billing_checkouts" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_one_open_owner" ON "billing_checkouts" USING btree ("user_id") WHERE "billing_checkouts"."state" IN ('CREATING','READY','UNKNOWN');--> statement-breakpoint
CREATE INDEX "checkout_reconcile" ON "billing_checkouts" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "billing_inbox_due" ON "billing_inbox" USING btree ("state","available_at");