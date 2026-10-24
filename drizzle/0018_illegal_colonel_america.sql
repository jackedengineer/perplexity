CREATE POLICY "passages_expired_delete" ON "source_passages" AS PERMISSIVE FOR DELETE TO public USING (EXISTS (SELECT 1 FROM run_retrievals r JOIN runs q ON q.id=r.run_id WHERE r.run_id = source_passages.run_id AND r.expires_at < clock_timestamp() AND q.status NOT IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT')));--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
  GRANT DELETE ON source_passages TO perplex_web;
 END IF;
END $$;
