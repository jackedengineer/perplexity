-- Metadata-only operator queries. Run in a READ ONLY transaction with a 5s
-- statement timeout. Each block is one query; never expose these through a route.

-- name: run_outcomes
SELECT policy_version, catalog_version, price_version, count(*)::integer AS admitted,
 count(*) FILTER (WHERE status='COMPLETED')::integer AS completed,
 count(*) FILTER (WHERE status='BLOCKED')::integer AS policy_refusals,
 count(*) FILTER (WHERE status='CANCELLED')::integer AS cancelled,
 count(*) FILTER (WHERE status='FAILED')::integer AS failed,
 count(*) FILTER (WHERE status='TIMED_OUT')::integer AS timed_out,
 count(*) FILTER (WHERE status IN ('COMPLETED','FAILED','TIMED_OUT'))::integer AS availability_denominator,
 count(*) FILTER (WHERE status IN ('FAILED','TIMED_OUT'))::numeric
 / nullif(count(*) FILTER (WHERE status IN ('COMPLETED','FAILED','TIMED_OUT')),0) AS failure_rate
FROM runs WHERE created_at >= clock_timestamp()-interval '24 hours'
GROUP BY policy_version,catalog_version,price_version;

-- name: provider_latency
SELECT c.stage,c.status,count(*)::integer AS calls,
 count(*) FILTER (WHERE c.finished_at IS NULL)::integer AS unfinished,
 percentile_cont(0.50) WITHIN GROUP (ORDER BY extract(epoch FROM c.finished_at-c.started_at)*1000) AS p50_ms,
 percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM c.finished_at-c.started_at)*1000) AS p95_ms,
 percentile_cont(0.99) WITHIN GROUP (ORDER BY extract(epoch FROM c.finished_at-c.started_at)*1000) AS p99_ms
FROM provider_calls c JOIN runs r ON r.id=c.run_id
WHERE r.created_at >= clock_timestamp()-interval '24 hours'
GROUP BY c.stage,c.status ORDER BY c.stage,c.status;

-- name: retrieval_health
SELECT r.status,r.query_verdict,r.evidence_verdict,count(*)::integer AS runs,
 sum((SELECT count(*) FROM run_sources s WHERE s.run_id=r.run_id))::integer AS approved_sources,
 count(*) FILTER (WHERE r.status='NO_EVIDENCE')::integer AS no_evidence,
 count(*) FILTER (WHERE r.status='UNAVAILABLE')::integer AS unavailable
FROM run_retrievals r WHERE r.created_at >= clock_timestamp()-interval '24 hours'
GROUP BY r.status,r.query_verdict,r.evidence_verdict;

-- name: safety_decisions
WITH decisions AS (
 SELECT 'INPUT' AS gate,i.decision::text,i.policy_version FROM input_safety_reviews i
 WHERE i.created_at >= clock_timestamp()-interval '24 hours'
 UNION ALL
 SELECT 'QUERY',r.query_verdict,r.policy_version FROM run_retrievals r
 WHERE r.created_at >= clock_timestamp()-interval '24 hours' AND r.query_verdict IS NOT NULL
 UNION ALL
 SELECT 'EVIDENCE',r.evidence_verdict,r.policy_version FROM run_retrievals r
 WHERE r.created_at >= clock_timestamp()-interval '24 hours' AND r.evidence_verdict IS NOT NULL
 UNION ALL
 SELECT 'OUTPUT',o.decision,o.policy_version FROM output_safety_reviews o
 WHERE o.created_at >= clock_timestamp()-interval '24 hours'
 -- Failure settlement can write an output-review placeholder before this gate.
 AND EXISTS (SELECT 1 FROM provider_calls c WHERE c.run_id=o.run_id AND c.stage='OUTPUT_SAFETY')
)
SELECT gate,decision,policy_version,count(*)::integer AS decisions
FROM decisions GROUP BY gate,decision,policy_version ORDER BY gate,decision;

-- name: false_refusal_feedback
-- Refusals are not confirmed false refusals. T17 collection/human labeling is open.
SELECT 'NOT_COLLECTED_T17'::text AS coverage,NULL::numeric AS false_refusal_rate,
 NULL::bigint AS labeled_cases,NULL::bigint AS confirmed_false_refusals;

-- name: reservations
SELECT r.id AS run_id,r.status,r.deadline_at,
 CASE WHEN r.status IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT') THEN 'EXPIRED_ACTIVE'
  WHEN s.run_id IS NULL THEN 'MISSING_SETTLEMENT' ELSE 'AWAITING_USAGE' END AS reason,
 coalesce(a.remaining_held_micro_usd,s.held_provider_micro_usd,u.provider_reserve_micro_usd)::text AS held_micro_usd,
 extract(epoch FROM clock_timestamp()-coalesce(s.created_at,r.deadline_at)) AS age_seconds
FROM runs r JOIN usage_reservations u ON u.run_id=r.id
LEFT JOIN run_settlements s ON s.run_id=r.id
LEFT JOIN LATERAL (SELECT remaining_held_micro_usd FROM run_reconciliations WHERE run_id=r.id ORDER BY version DESC LIMIT 1) a ON true
WHERE (r.status IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT') AND r.deadline_at<clock_timestamp())
 OR (r.status NOT IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT')
 AND (s.run_id IS NULL OR coalesce(a.remaining_held_micro_usd,s.held_provider_micro_usd)>0))
ORDER BY r.deadline_at,r.id LIMIT 100;

-- name: costs
WITH observed AS (
 SELECT c.run_id,
  sum(coalesce(greatest(c.cost_micro_usd,p.cost_micro_usd),0)) AS known,
  count(*) FILTER (WHERE (p.call_id IS NULL AND (c.cost_micro_usd IS NULL OR c.status IN ('STARTED','UNKNOWN')))
   OR p.cost_micro_usd<c.cost_micro_usd)::integer AS unknown_calls,
  count(*) FILTER (WHERE p.cost_micro_usd<c.cost_micro_usd OR greatest(c.cost_micro_usd,p.cost_micro_usd)>c.cap_micro_usd)::integer AS anomalies,
  sum(c.input_tokens)::integer AS input_tokens,sum(c.output_tokens)::integer AS output_tokens,
  sum(c.search_credits)::integer AS search_credits,
  count(*) FILTER (WHERE c.stage='SEARCH' AND c.search_credits IS NULL)::integer AS unknown_search_credits
 FROM provider_calls c LEFT JOIN provider_usage_resolutions p ON p.call_id=c.id
 GROUP BY c.run_id
), adjustments AS (
 SELECT run_id,sum(charged_micro_usd) AS charged FROM run_reconciliations GROUP BY run_id
)
SELECT r.id AS run_id,r.status,r.price_version,r.policy_version,r.accounting_version,
 CASE WHEN r.accounting_version<>1 THEN 'UNKNOWN_LEGACY'
  WHEN r.status IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT') THEN 'IN_PROGRESS'
  WHEN coalesce(o.unknown_calls,0)>0 THEN CASE WHEN coalesce(o.known,0)>0 THEN 'PARTIAL' ELSE 'UNKNOWN' END ELSE 'KNOWN' END AS cost_state,
 r.provider_reserve_micro_usd::text AS reserved_ceiling_micro_usd,
 coalesce(o.known,0)::text AS known_micro_usd,coalesce(o.unknown_calls,0) AS unknown_calls,coalesce(o.anomalies,0) AS anomalies,
 (s.known_provider_micro_usd+coalesce(a.charged,0))::text AS booked_micro_usd,
 coalesce(last_adjustment.remaining_held_micro_usd,s.held_provider_micro_usd,u.provider_reserve_micro_usd)::text AS held_micro_usd,
 s.credits_charged AS answer_credits,o.input_tokens,o.output_tokens,o.search_credits,o.unknown_search_credits
FROM runs r JOIN usage_reservations u ON u.run_id=r.id
LEFT JOIN observed o ON o.run_id=r.id LEFT JOIN run_settlements s ON s.run_id=r.id
LEFT JOIN adjustments a ON a.run_id=r.id
LEFT JOIN LATERAL (SELECT remaining_held_micro_usd FROM run_reconciliations WHERE run_id=r.id ORDER BY version DESC LIMIT 1) last_adjustment ON true
WHERE r.created_at>=clock_timestamp()-interval '24 hours'
ORDER BY r.created_at DESC,r.id LIMIT 100;
