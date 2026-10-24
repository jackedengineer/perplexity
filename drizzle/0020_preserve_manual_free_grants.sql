CREATE OR REPLACE FUNCTION public.ensure_free_credits(principal uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE guest boolean; verified boolean; born timestamptz; now_at timestamptz:=clock_timestamp();
 period_start timestamptz; period_end timestamptz; day_start timestamptz; allowance integer; version_name text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('run-admission:'||principal::text,0));
 SELECT u.is_anonymous,u.email_verified,u.created_at INTO guest,verified,born FROM app_users p JOIN "user" u ON u.id=p.auth_subject WHERE p.id=principal;
 IF NOT FOUND OR (NOT guest AND NOT verified) OR EXISTS(SELECT 1 FROM guest_links WHERE guest_id=principal) THEN RAISE EXCEPTION 'Principal not eligible'; END IF;
 -- Honor pre-existing operator-issued free grants until expiry; never overlap or reset them.
 IF NOT guest AND EXISTS(SELECT 1 FROM usage_buckets WHERE user_id=principal AND retired_at IS NULL AND starts_at<=now_at AND ends_at>now_at AND entitlement_version NOT IN ('guest-v1','free-v1')) THEN RETURN;END IF;
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
