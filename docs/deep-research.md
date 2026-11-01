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

## Dispatch and recovery operations

`after()` submits an idempotent maintenance kick after committed admission; it
never runs research in the web request. The separate dispatcher leases the outbox,
queues a delayed `watch-job-v1` command **before** `execute-job-v1`, then acknowledges
transport delivery. The watch queues its successor before sweeping while its owned
job remains active; terminal jobs stop the chain. Absolute job deadlines bound it.
`ENABLE_JOB_SCHEDULE=true` registers independent minute maintenance in Trigger
Production/Staging. Do not enable a schedule the service plan cannot support.
A missed initial kick is recovered by that independent scheduler, not by browser
polling. `pnpm jobs:worker` is a supervised local poll/consumer alternative;
`pnpm jobs:dispatch` automatically drains to Trigger Development. The two consumer
adapters share the same fenced engine. Use one execution adapter per environment.

All new cloud worker/admission payloads contain only job IDs. Raw provider errors,
private questions, excerpts and drafts are excluded from job logs/progress events.
Neutral per-step duration, outcome and cost observations support diagnosis. Pool
idle errors are handled without serializing connection objects; client query and
connection timeouts bound disconnected sockets independently of server SQL limits.

## Source and publication policy

General research ranks all thirty candidates with URL/text deduplication and
freshness preferences. An explicit request for official documentation uses reviewed
authorities for recognized SQLite, PostgreSQL, Next.js, React, Python, Rust and MDN
subjects (or domains explicitly named by the user). Tavily receives a restrictive
domain filter; the server independently removes out-of-scope results. Unrecognized
authorities are not certified by a model. Extend the reviewed registry deliberately.
Source identity and citation syntax do not establish factual entailment.

Final evidence is checked semantically, each section passes the existing citation
and release gate, and a separate gate inspects the complete assembled report for
cross-section interactions. Oversized safety packets fail closed without truncating
visible text. Only after all gates succeed does the publish checkpoint commit;
its report is returned only with the atomic COMPLETED settlement. Public reads
compile safe presentation nodes and strip private passages/hashes/model settings.
The owner can see the original question; another owner cannot read any job data.
Approved sections reveal by word; reduced motion, hidden tabs and explicit skip
controls reveal full approved text. No unchecked draft is streamed.

## Development setup and release gates

Apply `pnpm db:migrate` to the explicitly verified development target, then the
reviewed `scripts/runtime-grants.sql`. Migration 0028 adds private insert-only input
and checkpoint tables plus the reviewed workflow identifier. No production schema
or permissions are changed by implementation tests. Set `ENABLE_DEEP_RESEARCH=true`
in web/worker configuration only with explicit OpenRouter model/provider settings,
Tavily credentials, a bounded `JOB_OPERATOR_BUDGET_KEY`, and a verified paid TEST
period. Each job reserves **200,250 microUSD** at admission: six search caps, one
extraction cap, and separately claimed planning/safety/drafting calls. These are
conservative ceilings including search exposure, not a measured OpenRouter bill.
Razorpay TEST periods still grant ten bounded job attempts; LIVE sales/allowances
are not enabled by this change.

Use an ignored environment file with credentials kept out of shell arguments/logs.
Do not reset budgets, discard unknown-cost holds or automatically retry ambiguous
inference. Local TEST configuration never changes the public production site.
Do not install inference keys on the hosted TEST worker without the corresponding
credential-access authorization and a reviewed bounded worker budget.

Before public paid activation, separately verify: live billing/allowance policy,
production migrations and restricted grants, hosted worker secrets/isolation,
independent dispatch/recovery cadence, deployment rollback/restore, hosted latency,
retention/export/deletion policy for paid-job artifacts, and broader research
quality/safety evaluation. Browser Tasks and approvals remain a separate feature.

Official references: [Trigger triggering](https://trigger.dev/docs/triggering),
[scheduled tasks](https://trigger.dev/docs/tasks/scheduled),
[Tavily search](https://docs.tavily.com/documentation/api-reference/endpoint/search).
Next.js `after` behavior was checked against the installed 16.4.2 guide.

## Verified development evidence — 1 November 2026

- Lint/types/production build and high/critical audit gate pass. Ten isolated
  public/default-off production-build browser cases pass in 8.1 s; twelve existing
  answer-motion cases and both desktop/mobile report presentation cases pass.
- Final offline suite: 732/732 across 99 files in 100.96 s, run serially with
  unchanged deadlines/assertions and no skipped cases. The parallel startup-hook
  timeout run is retained as failed evidence.
- Restricted real PostgreSQL: two cases pass in 66.05 s; atomic checkpoint replay
  does not call the completed input provider again, the final report is readable
  only by its owner, and runtime checkpoint UPDATE is denied with SQLSTATE 42501.
- Final real in-app example completed all 26 steps in 106.683 s. It uses only the
  requested SQLite/PostgreSQL documentation authorities, passes all report gates,
  survives full reload, and exports Markdown. Browser console warnings/errors are
  empty. A separate live cancellation is durable and produces no late completion.
- Automated desktop/mobile presentation checks use simulated transport to avoid
  repeating paid research; real-provider execution is the separate example above.
  Existing answer-motion tests remain independent of Neon/provider credentials.
- Failed/expired earlier live attempts remain in history, with their uncertainty
  held. Their combined 26,000 microUSD holds were not released or reset to test again.
  A first completed example exposed a source-quality defect; the corrected policy
  now independently rejects out-of-authority results. One case does not certify
  broad factual quality or provider uptime.
- Logs/screenshots and provider metadata stay in ignored `.artifacts` files.
  A failed database test once serialized development connection details: that log
  is redacted and the development owner credential was rotated. Runtime/production
  credentials, the existing $2 cap and production financial ceilings were untouched.
- No hosted inference keys, application-production migration, live checkout,
  manual Vercel deployment, paid service upgrade or combined provider-cap increase occurred in this PR.
