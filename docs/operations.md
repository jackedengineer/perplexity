# Research operations

T20 answers four operational questions: why a run stopped, where time went, how
much provider usage is known or still held, and which safety boundary made a
decision. It adds no provider calls, retries, database writes or database round
trips. The [capped live verification](openrouter-live-verification.md) now records
actual provider results; full release acceptance and production deployment remain
pending. The [release checks](release-checklist.md) distinguish passed technical
checks from unfinished operational and hosted checks.

## Signals and correlation

The chat boundary generates a new request ID and private trace context. Client
request IDs/trace headers do not choose diagnostic IDs. `X-Request-Id` and the
owned `X-Run-Id` correlate a browser request to server logs. An idempotent replay
has a fresh request ID and the same run ID; it does not execute another run.
The exported `http.request` root has no external parent and ends when the handler
returns its response. Streaming children may finish later; use `run.execute` and
`http.delivery` for execution/delivery latency. Roots and children follow the
[OpenTelemetry span API](https://opentelemetry.io/docs/languages/js/instrumentation/#create-spans).

`research.span` JSON records START/END, span/parent IDs, stage, fixed outcome and
monotonic duration in milliseconds. Stages cover identity, request allowance,
validation, admission, input acceptance, retrieval, all four safety gates, search,
private drafting, citations, release, persistence and approved delivery. Early
spans cannot know a run/version before admission. The existing owned input claim
binds policy, catalog, price, entitlement and accounting snapshots to subsequent
events and enclosing span endings, without another database read.

`research.safety` contains only a fixed decision/reason, category codes and
prompt/detector versions. A BLOCK is a policy decision; UNAVAILABLE is a failed
check. Citation errors carry CITATION_INVALID. Evidence filtering emits
`research.sources` with returned/accepted/discarded counts, never source URLs,
titles or excerpts. NO_EVIDENCE and unavailable search are separate outcomes.

`research.provider_started` follows the committed one-time provider claim.
`research.usage` follows a successful ledger update and records call/stage IDs,
the trusted requested model, whether the actual model matches (never an arbitrary
provider model string), reported tokens/credits and known micro-USD. An UNKNOWN
status remains unresolved even when some usage is reported. Failed update attempts
do not emit another usage event. No provider-response objects are serialized.

`research.run_usage` is a bounded, ten-call observation of this execution. Known
cost includes planning, input/query/evidence/output classifiers and a private draft even
when the output is rejected. Token totals are reported subtotals; absent model
token usage is null when no subtotal is known. Unknown calls and search credits
remain explicit. Tavily's one reported credit does not imply a known USD charge.
`estimatedUpperBoundMicroUsd` is the versioned reservation ceiling with
`estimateKind=RESERVATION_CEILING`, not a predicted bill or a vendor guarantee.
Known/partial/unknown cost is never conflated with that ceiling.

The immutable settlement and append-only reconciliation records are authoritative
for charged credits, booked cost and holds. A late callback can emit usage after
the run subtotal; process termination can lose log events entirely. Use the SQL
report for current accounting, and deduplicate exported usage by provider call
ID. Never sum run subtotals and per-call events together or add the same monetary
reservation across the four overlapping user/operator windows.

`chat.admission` logs every POST outcome, including accepted and duplicate intents;
`chat.execution` measures delivery attempts, including canonical replays. Count
new runs using `run.execute` END or database run IDs. Do not use SSE HTTP 200 as
the success denominator: a stream can finish with an in-band error.

`research.first_progress` measures request arrival to the first neutral research
stage after input acceptance. `research.approved_delivery` measures arrival to
the first approved payload enqueued into the public response after persistence
and owned loading. The SDK writer suppresses closed-stream enqueue errors, so
the observation is made at the response queue boundary, with its captured trace
context, rather than when writing to the SDK. This is not a network acknowledgement.
Progress streaming
does not stream a private draft. `http.delivery` ends when server delivery work
finishes, not when a client paints or acknowledges the answer.

## Metrics and export

The pinned OpenTelemetry API provides manual spans, counters and millisecond
histograms. Instrument handles are cached; their dimensions use fixed stages,
outcomes and categories. Request/run/call IDs, versions, model IDs, category arrays
and URLs are never metric dimensions. Histograms support p50/p95/p99; the database
latency query also works across processes and restarts.

JSON logs are the enabled operational transport. No collector, SDK, vendor
account, remote exporter or alert delivery service is configured by this change;
the OpenTelemetry API is otherwise a no-op. Use these manual hooks when an
approved exporter is configured. Do not enable general AI/HTTP/SQL payload
capture: ORM auto-spans can include query parameters, and authentication spans
can include session metadata. Restrict any future exporter to this manual scope
and its field allowlist before enabling it. The AI SDK continues to disable
input/output telemetry explicitly. See the installed Next instrumentation guide
and [OpenTelemetry manual instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/).

The current bounded FAST path logs every instrumented execution. Sink/API failures
are best effort and cannot retry provider work or alter admission, safety,
accounting or approved persistence. The ledger supports investigation when a
process disappears before emitting END. There are no process-local usage counters
acting as global billing/rate controls.

## Operator query set

Run [operations.sql](operations.sql) from a trusted operator database session,
inside `BEGIN READ ONLY; SET LOCAL statement_timeout='5s';`, followed by ROLLBACK.
Use a read-only role with only the metadata columns required by the statements.
Do not grant operator access to the public runtime or add a public diagnostics
endpoint. Keep connection credentials in an ignored local service configuration;
never paste connection strings into commands, logs, issues or screenshots.

The named reports provide:

- `run_outcomes`: 24-hour admission and terminal counts by versions. Availability
  denominator is COMPLETED + FAILED + TIMED_OUT; policy refusals/cancellation are
  reported separately. Pending runs are included in admitted, not that denominator.
- `provider_latency`: 24-hour DB-clock p50/p95/p99 by provider stage/status and an
  unfinished count. This includes claim-to-ledger-finish time; nested gate/DB spans
  add application context. Null unfinished durations are not zero-latency calls.
- `retrieval_health`: unavailable/no-evidence and approved-source counts. Rejected
  source counts are log metrics; no rejected evidence is persisted for ops.
- `safety_decisions`: durable gate decisions. Output settlement placeholders with
  no finished classifier call (including abandoned STARTED and SKIPPED claims)
  are excluded. Citation/pre-classifier failures are visible
  in stage traces; this report is not a count of all deterministic guard executions.
- `false_refusal_feedback`: OWNER_REPORTS_ONLY counts from approved owned messages, with null confirmed rates and human-label denominators. Independent human adjudication remains open;
  a refusal count alone cannot establish a false-refusal rate. Once labeled,
  report confirmed false refusals / labeled benign requests, plus sample size,
  policy/model versions and reviewer agreement. Never treat missing feedback as 0%.
- `reservations`: at most 100 oldest expired active, missing-settlement or unresolved
  holds, across all ages. An AWAITING_USAGE hold is conservative accounting, not
  automatic proof of a stuck worker. Never release it merely because time elapsed.
- `costs`: at most 100 recent runs, with observed/receipt cost, booked adjustments,
  holds, customer credits, tokens, search credits and anomalies. Verified receipts
  replace uncertainty once; adjustments are aggregated before joining. Contradictory
  receipts never reduce an observed charge. UNKNOWN_LEGACY/IN_PROGRESS states are
  explicit. This report covers provider usage, not hosting/database/payment costs.
  Runs with no search dispatch report zero search credits; dispatched searches
  with missing usage retain null credits and an unknown count. Legacy accounting
  retains null search totals and coverage rather than assuming a complete ledger.

Read-only operator access, seven-day diagnostic-log retention, deletion/export
handling for pseudonymous request/run IDs and a verified exporter/alert destination
are deployment configuration gates. This change creates no new log drain or
retention job. Do not publish trace files containing live identifiers. Keep local
browser/debug artifacts ignored; published examples must be synthetic.

## Investigation and alert rules

Find `chat.admission`/`chat.execution` by the browser request ID, then group
`research.*` events by run/trace ID. Compare nested stage durations rather than
adding overlapping spans. Inspect fixed decision/reason and version fields, then
check the durable reservation/cost reports if a provider timed out or a process
ended. Consult [run recovery](run-recovery.md) for reconciliation; no investigation
should replay providers or reset live allowances.

Initial watch conditions use the system-design objectives: availability failure
rate over 2% or approved-delivery p95 over 40 seconds for 15 minutes with at least
20 eligible samples. Treat lower-volume failures as individual investigations,
not statistically established SLO violations. Any expired active run beyond its
45-second deadline plus one minute warrants checking recovery authorization and
the scheduler. A held balance over a day warrants receipt/reconciliation review;
it does not authorize a refund. An over-cap or contradictory-cost anomaly warrants
stopping new paid dispatch and investigating provider/configuration receipts.

These are documented watch/runbook rules, not installed notifications. When a
destination is configured, test a synthetic failure, deadline and stale hold
through it before declaring alerts operational. Hosted cron, paid timing/quality
checks and public launch remain separate gates. Reverting instrumentation does
not remove or alter provider claims, settlements, adjustments or reservations.

## Verification — 2026-10-23

- Lint, TypeScript, 466 tests in 48 files and production build pass. Coverage includes
  privacy/context isolation, sync/async sink outages, broken OpenTelemetry adapters,
  rejected-output billing, reconciliation joins and legacy uncertainty.
- `pnpm test:telemetry:neon` passes a full guarded execution under the restricted
  development role and all seven SQL reports in a READ ONLY transaction. Its run
  span took 17,467 ms with synthetic providers: retrieval 6,638 ms and persistence
  2,115 ms. These include development database/network work, not paid-model timing.
- Eight guarded desktop/mobile cases pass for approved citations, reload/replay,
  input/output refusals and search failure; four approved/refused cases pass again
  on the final build. Eight public/accessibility, sign-in error and 404 cases pass.
  The in-app browser independently verified safe unavailability with paid keys
  disabled and a clean console, then returned to the workspace. Both existing real
  conversations still have zero persisted runs/messages; request counters remain.
- `pnpm test:telemetry:evidence` validates strict fields, unique spans, parent/end
  pairing, correlation and per-call/run usage equality across 12 synthetic runs.
  Rejected outputs include safety/draft costs. The first eight-case capture recorded
  progress in 4,723–5,428 ms across six accepted-input runs; initial approved payloads
  took 18,468 / 18,982 ms and replay 1,121 / 1,163 ms. No private research text or
  upstream diagnostics appear. An induced search outage has a complete seven-stage
  failing trace and explicit unknown search cost.
- Public performance checks and 18 private samples pass existing budgets: max
  private LCP 972 ms, CLS 0, JavaScript transfer 193,719 bytes. Profiles use three
  cold-cache samples/route/profile, desktop and mobile CDP CPU 4x without network
  shaping; some synthetic browser traffic ran concurrently. Twenty metadata API
  probes (five/operation) had median/max ms of list 231/240, conversation 300/306,
  history 309/318 and missing run 236/284. These are local lab samples, not field
  INP, capacity claims or paid-model benchmarks.
- Fourteen configured credential values are absent from source, Git history and
  client chunks; test-provider/server-telemetry markers are absent from client
  chunks. Audit has no high/critical production advisories; the existing moderate
  tooling advisory remains. Disposable identities/budgets and orphaned counter
  keys are zero after cleanup.

Reproduce the captured evidence with the synthetic provider fixtures:

```sh
pnpm test:search:neon --grep 'a public question|public input-block|public output-block|public search-failure' > .artifacts/t20-browser.log 2>&1
pnpm test:search:neon --grep 'a public question|public output-block' > .artifacts/t20-final-browser.log 2>&1
pnpm test:telemetry:evidence
```

Ignored evidence includes `t20-failed-trace.jsonl`, `t20-neon-trace.jsonl`, browser
logs/screenshots and DevTools profiles. T20 changes no schema or production
configuration: development has 24 tables; production remains at 21. Production
migrations 0007–0008, hosted recovery, exporter/retention/notification setup, T17
feedback and paid testing remain explicit release/dependency gates.

T12–T17 update: development now has 26 tables and migrations through 0013. Provider observations include PLANNER, QUERY_SECOND, SEARCH_SECOND and EXTRACT; reconciliation supports both immutable accounting profiles. Source metrics distinguish extraction failures and selected extracted passages. Feedback counts owner reports without claiming a confirmed false-refusal rate. See [planning](query-planning.md), [retrieval](retrieval.md) and [feedback](feedback.md) for current behavior. Historical T19/T20 measurements above describe their recorded candidates. Production migration, hosted recovery/telemetry, retention and public/paid launch checks remain outstanding.
