# Production operations verification — 31 October 2026

The canonical site remains https://perplexity-gold-alpha.vercel.app on main
`e3be5792b16dc7c0e77c16465432c12d10d64794`. These are bounded operational
checks, not full quality acceptance. No AI inference, provider quota change,
credential rotation or budget increase was performed. Private evidence is in
ignored `.artifacts/`; it must not be uploaded with credentials or user content.

## Scheduled recovery

- Vercel shows `/api/internal/recovery` enabled at `0 2 * * *` before and after
  the rollback drill. Hobby's one-hour delivery window is reflected in the UI.
- Before any manual invocation today, production's `scheduled-recovery` record
  showed COMPLETED: started `2026-10-31T02:52:48.187Z`, completed
  `02:52:48.976Z` (08:22:48 IST). There were no overdue active runs.
- An authenticated manual GET returned HTTP 200: recovery and reconciliation
  each scanned zero, recovered/reconciled zero, failed zero; retention and guest
  cleanup also returned zero. It used a distinct verification user agent, not
  `vercel-cron/1.0`. The scheduled record stayed unchanged, proving this manual
  check did not manufacture scheduler freshness.
- All operator ceilings, expirations, settled costs and unknown-cost holds
  remained identical. Run/provider-call counts remained 19/83.
- The runtime log UI's Hobby window did not reach the morning invocation.
  Scheduler evidence is the pre-existing durable scheduled marker plus the enabled
  Vercel schedule, not a newly captured platform request trace. This marker uses
  an authenticated request's user agent; it is not cryptographic proof of origin.
- There was no stale production run to repair. Actual killed-handler recovery,
  overlapping reapers, late-cost reconciliation and renewal locking were instead
  exercised in the pinned development Neon database with synthetic providers.
  Do not manufacture overdue runs or billing receipts in production for a drill.

The six development Neon cases passed after fixing an obsolete assertion: the
current v2 fixture includes a 100-micro-USD planner call. Its exact reconciled
amount is 8,500, rather than the old 8,400. Both user buckets release all verified
unused holds, charge zero answer credits and retain the late answer cost once.
The original failed run and diagnostic are retained. No runtime code changed.

## Actual application rollback and restoration

1. Verify Vercel's previous eligible production artifact is `65DMqLWbX3y4PjpzbybdrznqVWsH`
   (`e6a5e72`). Its homepage loads. `git diff e6a5e72 e3be579 -- src vercel.json`
   is empty: application runtime, prompts and cron schedule match.
2. Execute Instant Rollback from `7N7Y1qy91sYXxYow9SMt3FarZMts` to that artifact.
   The project overview confirmed the rollback and its reason. Reload the known
   owned water-cycle answer on the canonical host: its approved text and three
   citations remain available through the existing signed-in session.
3. Promote the existing main artifact `7N7Y1qy91sYXxYow9SMt3FarZMts` to undo the
   rollback. Confirm the canonical domain is back on Ready/main `e3be579` and the
   overview again says main pushes update production. Reload the saved answer
   again and verify the enabled cron configuration.
4. Read production accounting and migration state: 25 migrations (0000–0024),
   unchanged ceilings/holds/counters and unchanged 19 runs/83 provider calls.
   Migration 0024 and restricted runtime grants were retained throughout.

This is an application-routing drill, not a new database restore, paid research
test or model rollback evaluation. Do not run the older artifact's provisioning
or renewal scripts. Vercel retains the selected artifact's environment and pauses
automatic domain assignment during rollback; undo it by promoting the known main
artifact. Review credentials, expiry, prompts and schema compatibility before any
future rollback. See [Vercel's rollback contract](https://vercel.com/docs/instant-rollback).

## Hosted latency smoke

Ten sequential unauthenticated Node HTTP requests per route, concurrency one,
connection reuse, no network shaping, first request retained. All 50 statuses
matched their expectations. Numbers measure full response reads from this client.

| Route | Expected status | Median | Sample p95 / maximum |
| --- | --- | --- | --- |
| `/` | 200 | 92 ms | 1,043 ms |
| `/sign-in` | 200 | 186 ms | 237 ms |
| `/api/auth/get-session` | 200 | 167 ms | 199 ms |
| `/api/conversations` | 401 | 177 ms | 293 ms |
| `/api/internal/recovery` without bearer | 401 | 168 ms | 1,071 ms |

The last two are authorization-denial latency, not authenticated database reads.
All six canonical-entry/retired-host redirect probes also passed.

Native Chrome DevTools, one cache-reused unthrottled navigation per route at
825 × 756 content viewport, reported:

| Page | TTFB | LCP | CLS |
| --- | --- | --- | --- |
| Homepage | 81 ms | 604 ms | 0 |
| Signed-in workspace | 105 ms | 952 ms | 0 |

Buffered read-only PerformanceObservers measured LCP/CLS. Both samples fit the
existing 2.5-second / 0.1 lab budgets. Cache-reused zero JS transfer is not evidence
for the cold-cache bundle budget. No field INP, representative mobile/slow-network
profile or load-capacity claim is made. Chrome found a homepage `/favicon.ico`
404; the inspected saved-answer console had no warning/error entries.

Read-only production data for the prior 48 hours contained six COMPLETED runs:
server execution median 11,532 ms, sample p95/max 12,748 ms. Three FAILED and two
CANCELLED runs are reported separately in the private data. Completed answer calls
had median 3,118 ms and p95/max 4,077 ms. All seven planner records were SKIPPED;
these observations do not validate complex planning. These are database execution
intervals, not browser first-progress, approved-delivery or streaming TTFT.

## Budget and remaining gates

Read-only OpenRouter metadata confirmed a $1.80 non-resetting replacement key,
$0.037027887 usage, $1.762972113 remaining and November 5, 17:18 IST expiry.
The retired key's metadata endpoint still returned 401.
Together with the conservative $0.20 retired-key allowance, maximum exposure
remains **$2**. Metadata can lag; it does not justify releasing unknown holds.
The $1 operator period has $0.299921 available, which binds before the key cap.
The current renewed daily window has its normal $0.40 ceiling. Yesterday's
explicitly approved $0.60 adjustment did not raise future daily defaults.

Full release acceptance still requires current planning/answer evaluation and
independent human claim/safety review; a usable production operator allowlist
(the locally approved verified owner still gets 404 at hosted `/operations`);
current kill-switch and latest-schema restore/deletion-replay drills; representative
latency/error-rate measurements and field monitoring; and the missing favicon.
Razorpay activation remains deferred. Scheduled delivery is now observed, but
production stale-run repair was not exercised against a real failed request.

Local validation passed lint, generated route types/TypeScript, 23 targeted
offline cases and all six real development Neon cases. The default full check
failed eight PGlite initialization hooks (622 passed, 41 not executed). A separate
one-worker run with unchanged deadlines failed four different initialization
hooks (630 passed, 33 not executed). The failed file sets are disjoint, so all
663 test bodies passed across the two runs, but **neither is a clean full run**.
Keep a fresh clean full Quality CI result as a review gate; do not raise hook
deadlines, skip cases or report the local `pnpm check` as passing. Both failed
logs remain. [Quality run 41174423242](https://github.com/jackedengineer/perplexity/actions/runs/41174423242)
subsequently passed on `92640af`: lint/types, 663/663 tests across 83 files,
the high/critical production audit gate, build and eight browser tests. Later
commits still require their own CI and exact-head reviews before merging.

Evidence: `production-checks-20261031-before.json`, `production-recovery-20261031.json`,
`production-rollback-final-20261031.json`, `production-http-latency-20261031.json`,
`production-server-latency-20261031.json`, `production-browser-latency-20261031.json`,
`production-checks-neon-20261031.log`, `production-recovery-diagnostic-20261031.log`,
`production-checks-neon-fixed-20261031.log`, `production-*-20261031.png`, and
`production-entry-20261031.log`, `production-retired-key-20261031.json`,
`production-checks-quality-20261031.log`, `production-checks-serial-quality-20261031.log`,
all under ignored `.artifacts/`.
