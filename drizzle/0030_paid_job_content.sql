ALTER TABLE "durable_jobs" ADD COLUMN "deleted_at" timestamp (3) with time zone;
--> statement-breakpoint
-- Narrow content operations; callers cannot undelete jobs or erase financial rows.
CREATE FUNCTION public.perplex_delete_job_content(p_job uuid,p_subject text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target public.durable_jobs%ROWTYPE;
BEGIN
 SELECT j.* INTO target FROM public.durable_jobs j
 JOIN public.app_users u ON u.id=j.user_id
 WHERE j.id=p_job AND u.auth_subject=p_subject FOR UPDATE OF j;
 IF NOT FOUND THEN RETURN false; END IF;
 IF target.state IN ('QUEUED','RUNNING') THEN
  RAISE EXCEPTION 'Active work must be cancelled before deletion' USING ERRCODE='55000';
 END IF;
 UPDATE public.durable_jobs SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE id=p_job;
 DELETE FROM public.job_checkpoints WHERE job_id=p_job;
 DELETE FROM public.job_research_inputs WHERE job_id=p_job;
 RETURN true;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.perplex_prune_job_evidence()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE affected integer;
BEGIN
 WITH expired AS (
  SELECT c.job_id,c.step FROM public.job_checkpoints c
  JOIN public.durable_jobs j ON j.id=c.job_id
  WHERE j.state IN ('COMPLETED','CANCELLED','FAILED','EXPIRED')
   AND c.step<>'publish' AND c.created_at<clock_timestamp()-interval '24 hours'
  ORDER BY c.created_at,c.job_id,c.step LIMIT 100 FOR UPDATE OF c SKIP LOCKED
 ) DELETE FROM public.job_checkpoints c USING expired e WHERE c.job_id=e.job_id AND c.step=e.step;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.perplex_delete_job_content(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perplex_prune_job_evidence() FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
  GRANT EXECUTE ON FUNCTION public.perplex_delete_job_content(uuid,text),public.perplex_prune_job_evidence() TO perplex_web;
 END IF;
END $$;
