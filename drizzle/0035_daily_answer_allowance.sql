ALTER TABLE "credit_grants" DROP CONSTRAINT "credit_grant_valid";--> statement-breakpoint
ALTER TABLE "guest_links" DROP CONSTRAINT "guest_link_valid";--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grant_valid" CHECK ("credit_grants"."ends_at">"credit_grants"."starts_at" AND ("credit_grants"."kind"='GUEST' AND "credit_grants"."credits" IN (6,620) OR "credit_grants"."kind"='FREE' AND "credit_grants"."credits" IN (40,4650)));--> statement-breakpoint
ALTER TABLE "guest_links" ADD CONSTRAINT "guest_link_valid" CHECK ("guest_links"."guest_id"<>"guest_links"."user_id" AND "guest_links"."credits" BETWEEN 0 AND 620 AND "guest_links"."day_credits" BETWEEN 0 AND "guest_links"."credits");
--> statement-breakpoint
-- Ten answers/day, up to 15 credits each for registered users and 2 for guests.
-- A guest's rolling 30-day trial can overlap 31 IST calendar days.
-- Original grant receipts stay immutable; this migration records the policy uplift.
CREATE OR REPLACE FUNCTION public.ensure_free_credits(principal uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE guest boolean; verified boolean; born timestamptz; now_at timestamptz:=clock_timestamp();
 period_start timestamptz; period_end timestamptz; day_start timestamptz; allowance integer; version_name text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('run-admission:'||principal::text,0));
 SELECT u.is_anonymous,u.email_verified,u.created_at INTO guest,verified,born FROM app_users p JOIN "user" u ON u.id=p.auth_subject WHERE p.id=principal;
 IF NOT FOUND OR (NOT guest AND NOT verified) OR EXISTS(SELECT 1 FROM guest_links WHERE guest_id=principal) THEN RAISE EXCEPTION 'Principal not eligible'; END IF;
 -- Honor pre-existing operator-issued free grants until expiry; never overlap or reset them.
 IF NOT guest AND EXISTS(SELECT 1 FROM usage_buckets WHERE user_id=principal AND retired_at IS NULL AND starts_at<=now_at AND ends_at>now_at AND entitlement_version NOT IN ('guest-v1','free-v1','guest-v2','free-v2')) THEN RETURN;END IF;
 day_start:=date_trunc('day',now_at AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
 IF guest THEN
  period_start:=born;period_end:=born+interval '30 days';allowance:=620;version_name:='guest-v2';
  IF period_end<=now_at THEN RAISE EXCEPTION 'Trial expired';END IF;
 ELSE
  period_start:=date_trunc('month',now_at AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
  period_end:=(date_trunc('month',now_at AT TIME ZONE 'Asia/Kolkata')+interval '1 month') AT TIME ZONE 'Asia/Kolkata';
  allowance:=4650;version_name:='free-v2';
 END IF;
 INSERT INTO usage_buckets(user_id,kind,starts_at,ends_at,entitlement_version,credit_limit,provider_limit_micro_usd)
 VALUES(principal,'PERIOD',period_start,period_end,version_name,allowance,31000000),
 (principal,'DAY',day_start,day_start+interval '1 day',version_name,CASE WHEN guest THEN 20 ELSE 150 END,1000000)
 ON CONFLICT(user_id,kind,starts_at) WHERE retired_at IS NULL DO UPDATE SET
  credit_limit=GREATEST(usage_buckets.credit_limit,EXCLUDED.credit_limit),
  provider_limit_micro_usd=GREATEST(usage_buckets.provider_limit_micro_usd,EXCLUDED.provider_limit_micro_usd),
  entitlement_version=EXCLUDED.entitlement_version;
 INSERT INTO credit_grants(user_id,bucket_id,kind,starts_at,ends_at,credits)
 SELECT principal,id,CASE WHEN guest THEN 'GUEST' ELSE 'FREE' END,period_start,period_end,allowance FROM usage_buckets
 WHERE user_id=principal AND kind='PERIOD' AND starts_at=period_start AND entitlement_version=version_name AND retired_at IS NULL
 ON CONFLICT DO NOTHING;
END $$;

--> statement-breakpoint
-- Apply the same floors to all existing, non-retired current/future windows,
-- including manual grants. Never reset usage, reservations, holds or window dates.
UPDATE usage_buckets b SET
 credit_limit=GREATEST(b.credit_limit,CASE WHEN b.kind='DAY' THEN CASE WHEN u.is_anonymous THEN 20 ELSE 150 END ELSE CASE WHEN u.is_anonymous THEN 620 ELSE 4650 END END),
 provider_limit_micro_usd=GREATEST(b.provider_limit_micro_usd,CASE WHEN b.kind='DAY' THEN 1000000 ELSE 31000000 END),
 entitlement_version=CASE WHEN b.entitlement_version IN ('guest-v1','free-v1') THEN CASE WHEN u.is_anonymous THEN 'guest-v2' ELSE 'free-v2' END ELSE b.entitlement_version END
FROM app_users p JOIN "user" u ON u.id=p.auth_subject
WHERE b.user_id=p.id AND b.retired_at IS NULL AND b.ends_at>clock_timestamp()
 AND (u.is_anonymous OR u.email_verified)
 AND NOT EXISTS(SELECT 1 FROM guest_links l WHERE l.guest_id=p.id);
