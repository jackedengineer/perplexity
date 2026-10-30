-- Correct the deployed function without rewriting migration history.
CREATE OR REPLACE FUNCTION public.ensure_operator_day(p_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE period_row public.operator_usage_buckets%ROWTYPE;
DECLARE period_count integer;
DECLARE active_days integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('perplex:operator-day:' || p_key,0));
 -- Match admission, settlement and reconciliation: lock shared rows by ID.
 PERFORM id FROM public.operator_usage_buckets
 WHERE budget_key=p_key AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp()
 ORDER BY id FOR UPDATE;
 SELECT count(*) INTO period_count FROM public.operator_usage_buckets
 WHERE budget_key=p_key AND kind='PERIOD' AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp();
 IF period_count<>1 THEN RETURN; END IF;
 SELECT * INTO period_row FROM public.operator_usage_buckets
 WHERE budget_key=p_key AND kind='PERIOD' AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp();
 SELECT count(*) INTO active_days FROM public.operator_usage_buckets
 WHERE budget_key=p_key AND kind='DAY' AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp();
 IF active_days<>0 OR period_row.provider_limit_micro_usd-period_row.reserved_provider_micro_usd-period_row.settled_provider_micro_usd<50000 THEN RETURN; END IF;
 INSERT INTO public.operator_usage_buckets(budget_key,kind,starts_at,ends_at,provider_limit_micro_usd)
 VALUES(p_key,'DAY',clock_timestamp(),LEAST(period_row.ends_at,clock_timestamp()+interval '24 hours'),LEAST(400000,period_row.provider_limit_micro_usd));
END $$;
