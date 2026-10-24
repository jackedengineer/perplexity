CREATE TABLE "credit_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bucket_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"credits" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_grant_valid" CHECK ("credit_grants"."ends_at">"credit_grants"."starts_at" AND ("credit_grants"."kind"='GUEST' AND "credit_grants"."credits"=6 OR "credit_grants"."kind"='FREE' AND "credit_grants"."credits"=40))
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"credits" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_entry_valid" CHECK ("credit_ledger"."kind" IN ('RESERVE','CHARGE','RELEASE') AND "credit_ledger"."credits" BETWEEN 0 AND 15)
);
--> statement-breakpoint
CREATE TABLE "guest_links" (
	"guest_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"day_credits" integer NOT NULL,
	"linked_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_link_valid" CHECK ("guest_links"."guest_id"<>"guest_links"."user_id" AND "guest_links"."credits" BETWEEN 0 AND 6 AND "guest_links"."day_credits" BETWEEN 0 AND "guest_links"."credits")
);
--> statement-breakpoint
CREATE TABLE "guest_trials" (
	"handle_hash" varchar(64) PRIMARY KEY NOT NULL,
	"auth_subject" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "guest_trials_auth_subject_unique" UNIQUE("auth_subject"),
	CONSTRAINT "guest_trial_valid" CHECK ("guest_trials"."handle_hash" ~ '^[a-f0-9]{64}$' AND "guest_trials"."expires_at">"guest_trials"."created_at")
);
--> statement-breakpoint
DROP INDEX "usage_bucket_window_unique";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_buckets" ADD COLUMN "retired_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_bucket_id_usage_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."usage_buckets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_links" ADD CONSTRAINT "guest_links_guest_id_app_users_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_links" ADD CONSTRAINT "guest_links_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_grant_once" ON "credit_grants" USING btree ("user_id","kind","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_grant_bucket_once" ON "credit_grants" USING btree ("bucket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_run_kind_once" ON "credit_ledger" USING btree ("run_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_bucket_window_unique" ON "usage_buckets" USING btree ("user_id","kind","starts_at") WHERE "usage_buckets"."retired_at" IS NULL;--> statement-breakpoint
-- Runtime can request these fixed free grants, but cannot mint arbitrary limits.
CREATE FUNCTION public.ensure_free_credits(principal uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE guest boolean; verified boolean; born timestamptz; now_at timestamptz:=clock_timestamp();
 period_start timestamptz; period_end timestamptz; day_start timestamptz; allowance integer; version_name text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('run-admission:'||principal::text,0));
 SELECT u.is_anonymous,u.email_verified,u.created_at INTO guest,verified,born FROM app_users p JOIN "user" u ON u.id=p.auth_subject WHERE p.id=principal;
 IF NOT FOUND OR (NOT guest AND NOT verified) OR EXISTS(SELECT 1 FROM guest_links WHERE guest_id=principal) THEN RAISE EXCEPTION 'Principal not eligible'; END IF;
 day_start:=date_trunc('day',now_at AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
 IF guest THEN
  period_start:=born;period_end:=born+interval '30 days';allowance:=6;version_name:='guest-v1';
  IF period_end<=now_at THEN RAISE EXCEPTION 'Trial expired';END IF;
 ELSE
  period_start:=date_trunc('month',now_at AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
  period_end:=(date_trunc('month',now_at AT TIME ZONE 'Asia/Kolkata')+interval '1 month') AT TIME ZONE 'Asia/Kolkata';
  allowance:=40;version_name:='free-v1';
 END IF;
 INSERT INTO usage_buckets(user_id,kind,starts_at,ends_at,entitlement_version,credit_limit,provider_limit_micro_usd)
 VALUES(principal,'PERIOD',period_start,period_end,version_name,allowance,allowance*25000),
 (principal,'DAY',day_start,day_start+interval '1 day',version_name,CASE WHEN guest THEN 6 ELSE 20 END,CASE WHEN guest THEN 150000 ELSE 250000 END)
 ON CONFLICT(user_id,kind,starts_at) WHERE retired_at IS NULL DO NOTHING;
 INSERT INTO credit_grants(user_id,bucket_id,kind,starts_at,ends_at,credits)
 SELECT principal,id,CASE WHEN guest THEN 'GUEST' ELSE 'FREE' END,period_start,period_end,allowance FROM usage_buckets
 WHERE user_id=principal AND kind='PERIOD' AND starts_at=period_start AND entitlement_version=version_name AND retired_at IS NULL
 ON CONFLICT DO NOTHING;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.ensure_free_credits(uuid) FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
 GRANT EXECUTE ON FUNCTION public.ensure_free_credits(uuid) TO perplex_web;
 GRANT SELECT ON credit_grants, credit_ledger, guest_links, guest_trials TO perplex_web;
 GRANT INSERT ON credit_ledger, guest_trials TO perplex_web;
END IF; END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_credit_reservation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN INSERT INTO credit_ledger(run_id,kind,credits,created_at) VALUES(NEW.run_id,'RESERVE',NEW.answer_credits,NEW.created_at); RETURN NEW; END $$;
--> statement-breakpoint
CREATE TRIGGER credit_reservation_audit AFTER INSERT ON usage_reservations FOR EACH ROW EXECUTE FUNCTION public.record_credit_reservation();
--> statement-breakpoint
CREATE FUNCTION public.record_credit_settlement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE reserved integer;
BEGIN
 SELECT answer_credits INTO STRICT reserved FROM usage_reservations WHERE run_id=NEW.run_id;
 IF NEW.credits_charged>reserved THEN RAISE EXCEPTION 'Invalid credit settlement'; END IF;
 INSERT INTO credit_ledger(run_id,kind,credits,created_at) VALUES(NEW.run_id,'CHARGE',NEW.credits_charged,NEW.created_at),(NEW.run_id,'RELEASE',reserved-NEW.credits_charged,NEW.created_at);
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER credit_settlement_audit AFTER INSERT ON run_settlements FOR EACH ROW EXECUTE FUNCTION public.record_credit_settlement();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_credit_reservation(),public.record_credit_settlement() FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN REVOKE INSERT ON credit_ledger FROM perplex_web;END IF; END $$;
--> statement-breakpoint
ALTER TABLE runs ALTER CONSTRAINT runs_owned_conversation_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE usage_reservations ALTER CONSTRAINT reservation_run_snapshot_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE message_feedback ALTER CONSTRAINT feedback_owned_conversation_fk DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION public.link_guest_account(guest_subject text,target_subject text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_id uuid;new_id uuid;linked_id uuid; spent integer;today_spent integer;now_at timestamptz:=clock_timestamp();day_start timestamptz;
BEGIN
 SELECT p.id INTO old_id FROM app_users p JOIN "user" u ON u.id=p.auth_subject WHERE p.auth_subject=guest_subject AND u.is_anonymous;
 SELECT p.id INTO new_id FROM app_users p JOIN "user" u ON u.id=p.auth_subject WHERE p.auth_subject=target_subject AND NOT u.is_anonymous AND u.email_verified;
 IF old_id IS NULL OR new_id IS NULL OR old_id=new_id THEN RAISE EXCEPTION 'Invalid account link';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('run-admission:'||id::text,0)) FROM app_users WHERE id IN(old_id,new_id) ORDER BY id;
 SELECT user_id INTO linked_id FROM guest_links WHERE guest_id=old_id;
 IF linked_id IS NOT NULL THEN IF linked_id=new_id THEN RETURN;ELSE RAISE EXCEPTION 'Guest already linked';END IF;END IF;
 IF EXISTS(SELECT 1 FROM runs WHERE user_id=old_id AND status IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT')) THEN RAISE EXCEPTION 'Guest must be fenced first';END IF;
 day_start:=date_trunc('day',now_at AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
 SELECT coalesce(sum(s.credits_charged),0),coalesce(sum(s.credits_charged) FILTER(WHERE r.created_at>=day_start),0) INTO spent,today_spent FROM runs r JOIN run_settlements s ON s.run_id=r.id WHERE r.user_id=old_id;
 INSERT INTO guest_links(guest_id,user_id,credits,day_credits,linked_at) VALUES(old_id,new_id,spent,today_spent,now_at);
 -- Keep historical buckets and receipts, excluding them from current grants.
 UPDATE usage_buckets SET retired_at=now_at,user_id=new_id WHERE user_id=old_id;
 UPDATE conversations SET user_id=new_id WHERE user_id=old_id;
 UPDATE runs SET user_id=new_id WHERE user_id=old_id;
 UPDATE usage_reservations SET user_id=new_id WHERE user_id=old_id;
 UPDATE message_feedback SET user_id=new_id WHERE user_id=old_id;
 INSERT INTO admission_attempt_buckets(user_id,kind,starts_at,ends_at,attempts)
 SELECT new_id,kind,starts_at,ends_at,attempts FROM admission_attempt_buckets WHERE user_id=old_id
 ON CONFLICT(user_id,kind,starts_at) DO UPDATE SET attempts=admission_attempt_buckets.attempts+EXCLUDED.attempts;
 DELETE FROM admission_attempt_buckets WHERE user_id=old_id;
 DELETE FROM session WHERE user_id=guest_subject;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.link_guest_account(text,text) FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN GRANT EXECUTE ON FUNCTION public.link_guest_account(text,text) TO perplex_web;END IF;END $$;
