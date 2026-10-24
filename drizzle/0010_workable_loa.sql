ALTER TABLE "runs" DROP CONSTRAINT "run_accounting_version_valid";--> statement-breakpoint
ALTER TABLE "run_retrievals" DROP CONSTRAINT "retrieval_outcome_valid";--> statement-breakpoint
ALTER TABLE "run_retrievals" DROP CONSTRAINT "retrieval_ready_reviewed";--> statement-breakpoint
ALTER TABLE "source_passages" DROP CONSTRAINT "passage_content_valid";--> statement-breakpoint
ALTER TABLE "provider_calls" DROP CONSTRAINT "provider_cap_valid";--> statement-breakpoint
ALTER TABLE "provider_calls" DROP CONSTRAINT "provider_usage_valid";--> statement-breakpoint
ALTER TABLE "provider_calls" ADD COLUMN "budget_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "run_accounting_version_valid" CHECK ("runs"."accounting_version" IN (0,1,2));--> statement-breakpoint
ALTER TABLE "run_retrievals" ADD CONSTRAINT "retrieval_outcome_valid" CHECK ("run_retrievals"."status" IN ('STARTED','READY','NO_EVIDENCE','BLOCKED','UNAVAILABLE') AND ("run_retrievals"."query_verdict" IS NULL OR "run_retrievals"."query_verdict" IN ('ALLOW','BLOCK','UNAVAILABLE')) AND ("run_retrievals"."evidence_verdict" IS NULL OR "run_retrievals"."evidence_verdict" IN ('ALLOW','BLOCK','UNAVAILABLE')) AND ("run_retrievals"."search_credits" IS NULL OR "run_retrievals"."search_credits" BETWEEN 1 AND 2));--> statement-breakpoint
ALTER TABLE "run_retrievals" ADD CONSTRAINT "retrieval_ready_reviewed" CHECK ("run_retrievals"."status" NOT IN ('READY','NO_EVIDENCE') OR ("run_retrievals"."query_verdict" IS NOT DISTINCT FROM 'ALLOW' AND coalesce("run_retrievals"."search_credits",0) BETWEEN 1 AND 2 AND ("run_retrievals"."status" = 'NO_EVIDENCE' OR "run_retrievals"."evidence_verdict" IS NOT DISTINCT FROM 'ALLOW')));--> statement-breakpoint
ALTER TABLE "source_passages" ADD CONSTRAINT "passage_content_valid" CHECK (length("source_passages"."excerpt") BETWEEN 1 AND 1000 AND length(trim("source_passages"."excerpt")) > 0 AND "source_passages"."content_kind" IN ('SEARCH_PASSAGE','EXTRACTED_PAGE') AND "source_passages"."content_hash" = encode(sha256(convert_to("source_passages"."excerpt",'UTF8')),'hex'));--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_cap_valid" CHECK ("provider_calls"."cap_micro_usd" > 0 AND "provider_calls"."cap_micro_usd" = CASE WHEN "provider_calls"."budget_version"=1 THEN CASE "provider_calls"."stage" WHEN 'PLANNER' THEN 2000 WHEN 'INPUT_SAFETY' THEN 5000 WHEN 'QUERY_SAFETY' THEN 5000 WHEN 'SEARCH' THEN 8000 WHEN 'EVIDENCE_SAFETY' THEN 5000 WHEN 'ANSWER' THEN 20000 WHEN 'OUTPUT_SAFETY' THEN 5000 ELSE -1 END WHEN "provider_calls"."budget_version"=2 THEN CASE "provider_calls"."stage" WHEN 'PLANNER' THEN 2000 WHEN 'INPUT_SAFETY' THEN 2250 WHEN 'QUERY_SAFETY' THEN 2250 WHEN 'QUERY_SECOND' THEN 2250 WHEN 'SEARCH' THEN 8000 WHEN 'SEARCH_SECOND' THEN 8000 WHEN 'EXTRACT' THEN 8000 WHEN 'EVIDENCE_SAFETY' THEN 2250 WHEN 'ANSWER' THEN 12500 WHEN 'OUTPUT_SAFETY' THEN 2250 ELSE -1 END ELSE -1 END);--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_usage_valid" CHECK (("provider_calls"."cost_micro_usd" IS NULL OR "provider_calls"."cost_micro_usd" >= 0) AND ("provider_calls"."input_tokens" IS NULL OR "provider_calls"."input_tokens" BETWEEN 0 AND 1000000) AND ("provider_calls"."output_tokens" IS NULL OR "provider_calls"."output_tokens" BETWEEN 0 AND 1000000) AND ("provider_calls"."search_credits" IS NULL OR ("provider_calls"."stage"='EXTRACT' AND "provider_calls"."search_credits" BETWEEN 0 AND 1 OR "provider_calls"."stage" IN ('SEARCH','SEARCH_SECOND') AND "provider_calls"."search_credits"=1)));--> statement-breakpoint
-- Bind new immutable call snapshots to the run's accounting profile. Historical
-- receipts retain v1 caps; this never rewrites already incurred charges.
CREATE FUNCTION enforce_provider_budget_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.budget_version IS DISTINCT FROM (SELECT accounting_version FROM public.runs WHERE id=NEW.run_id) THEN
  RAISE EXCEPTION 'provider budget snapshot mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER provider_budget_snapshot_insert BEFORE INSERT ON provider_calls FOR EACH ROW EXECUTE FUNCTION enforce_provider_budget_snapshot();
