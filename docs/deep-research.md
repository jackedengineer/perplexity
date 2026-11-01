# Deep Research v1

Build on the reviewed durable job/outbox, paid-cycle admission, financial windows,
leases and owner-scoped replay. This implementation is a bounded research workflow,
not a browser agent. FAST research and its safety/accounting contracts stay intact.

## Acceptance contract

- Verified signed-in Pro TEST access only until LIVE billing is separately reviewed.
  Independent default-off `ENABLE_DEEP_RESEARCH`; no guest/free entitlement bypass.
- Original question (max 1,000 characters) stays intact. Deterministic secrets/abuse
  rejection occurs before persistence/forwarding. Input semantic safety precedes planning.
- A structured plan produces three distinct subquestions; after initial retrieval,
  another structured pass identifies three coverage/contradiction/freshness queries.
  Every outbound query has its own semantic gate with the original question.
- Six basic searches, at most thirty candidates, deterministic URL/content deduplication
  and relevance/freshness ranking, up to two extracted pages through Tavily only.
  Five final sources, each with an exact hashed passage, feed three report sections:
  summary, analysis, and limitations/conflicting evidence. Unsupported facts are omitted.
- Evidence is untrusted. Filter active injection/secrets; semantic evidence approval
  precedes drafting and refinement. Each visible section passes citation validation
  and output safety including the original question and visible source metadata.
  No private plan, raw candidate or draft is returned by public routes.
- Private checkpoints and step receipts commit atomically under a generation lease.
  Final approved report and terminal settlement commit together. A crash reuses
  committed outputs; ambiguous billable work fails closed with original holds retained.
- Per-call reservations, bounded bytes/tokens/timeouts, no model/provider fallbacks
  or automatic paid retries. Total OpenRouter cap remains $2. Search allowance is
  independently bounded. Models/providers/policy versions are snapshotted at admission.
- Submission accelerates the durable outbox after response. Independent minute-level
  Trigger maintenance (or supervised dispatcher) drains missed kicks and stale leases;
  a prequeued delayed watchdog precedes each dispatch. Hourly free cron is insufficient
  for the fifteen-minute deadline; do not claim launch readiness without this gate.
- Stop is a persisted owned transition; the worker aborts active I/O when heartbeat
  detects cancellation. Closing the tab does not stop work. Reload replays progress.
- UI has labelled question input, loading/Stop/reconnect states, approved citations,
  report export, keyboard navigation, reduced-motion support and mobile layouts.

## Build / verify order

1. Versioned manifests, strict submission, additive private input/checkpoint schema.
2. Manifest-aware admission/worker accounting and atomic checkpoint/report persistence.
3. Real bounded planning/search/extraction/safety/drafting adapters and consumer.
4. Automatic dispatch, independent recovery and delayed watchdog; transport failures.
5. Owner-only report UI and browser completion/reload/cancel/isolation checks.
6. Offline suite, lint/types/build, database-backed/browser checks, bounded live probe
   only if provider/key/operator capacity permits; release checklist and one PR.

Commands: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
Focused tests: `pnpm exec vitest run tests/integration/deep-research.test.ts`.
No secrets/logged prompts, resetting ledgers, weakened gates, live-sale activation,
production schema mutation, paid upgrades or application deployment in this PR.
