# T19 distributed usage and deadline contract

Postgres remains the shared authority. This task extends T05 admission and T18
recovery without adding Redis, anonymous trials, paid entitlements or provider
retries. Paid testing and production deployment remain pending.

Submission requests consume a separate abuse allowance before body validation,
provider configuration or run admission. Malformed, unowned, unavailable, blocked,
quota-denied and duplicate requests count. Verified subjects share counters across
sessions/processes. Unauthenticated submissions share one bounded service bucket;
no browser identity, forwarded IP, new cookie or request key creates an allowance.
Untrusted-origin traffic uses the anonymous bucket even when cookies are present,
so another site cannot drain a signed-in subject's request allowance. The same
origin predicate gates body parsing. Only digested scope keys and minute/day
metadata are stored, never request text.
The initial abuse ceilings are 30/minute and 200/India-calendar day per verified
subject; anonymous submission denials share 120/minute and 2,000/day per service
namespace. They do not share signed-in user allowances. These are conservative
starting policies, not measured capacity or paid-plan entitlements.

New owned intents retain the existing 3/minute, 20/day attempt limit, one active
run and atomic four-bucket monetary/credit reservation. Matching committed retries
do not reserve/charge again, but still consume abuse allocation. Database failure
fails closed as infrastructure unavailability, not fabricated rate/quota denial.

The original 45-second database deadline survives retries and disconnects. Every
provider stage gets one claim, a fixed monetary cap and the smaller of its stage
time budget and remaining run time. A fresh caller timeout cannot extend either.
Late/unknown billing is retained and reconciled through T18; recovery never replays
provider work. Rate, quota, deadline, infrastructure and policy outcomes remain
distinct fixed public codes and redacted log categories.

Conditional upserts use unique window keys and retain expected denial counters.
The implementation follows [Postgres ON CONFLICT](https://www.postgresql.org/docs/18/sql-insert.html),
[Read Committed locking](https://www.postgresql.org/docs/18/transaction-iso.html)
and [clock_timestamp](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).
Fixed windows permit a burst across a window boundary; no sliding-window claim is
made. Trusted-edge bot/IP controls and general retention automation remain T29/T22.


Migration `0008_request_rate_limits.sql` is additive and grants runtime SELECT,
INSERT and UPDATE of the count column only. Runtime cannot change window keys or
remove counter history. Apply after 0007, verify 24 tables and the restricted
permissions, then deploy. The development database is migrated; production is
unchanged. Roll back application code without deleting current counters or holds.
For small-volume operation, the database owner can periodically delete rows where
`ends_at < clock_timestamp() - interval '7 days'`; never remove a live window to
unblock a request. Automated retention remains T22. Test fixtures clean up only
captured synthetic subject digests using the pinned development owner connection.

## Provider claims

| Stage | Time ceiling | Reserved micro-USD |
| --- | ---: | ---: |
| Input safety | 5 seconds | 5,000 |
| Query safety | 5 seconds | 5,000 |
| Search | 8 seconds | 8,000 |
| Evidence safety | 5 seconds | 5,000 |
| Private answer | 12 seconds | 20,000 |
| Output safety | 5 seconds | 5,000 |

The complete single-attempt profile commits at most 48,000 micro-USD of stage
exposure within the existing 50,000 reservation. Each database claim returns its
ID, original run deadline, DB-clock remaining time and local monotonic observation.
Elapsed checkout/lock/round-trip time is deducted conservatively before dispatch.
Signals are not reused to restart a stage; the unique `(run_id, stage)` record
also prevents a fresh process/attempt fence from acquiring another paid claim.
Provider/SDK automatic retries and fallbacks remain disabled.

If cancellation/expiry is known before dispatch, a claimed but undispatched call
can record SKIPPED with zero usage. Once dispatched, a timeout remains UNKNOWN
unless actual usage arrives; a late result records billing without authorizing
continuation. Original bucket windows and held costs survive disconnect/retry.
Claims constrain application dispatch, not a provider's ability to overbill or
ignore cancellation; over-cap reports halt continuation and require investigation.
Database deadline expiry takes precedence over an abort when persisting TIMED_OUT.
Each stage timer also records its own expiry independently of caller cancellation.
Safety-stage expiry propagates TIMEOUT through each gate and becomes the same
DEADLINE_EXCEEDED outcome as an answer/search deadline, with TIMED_OUT persistence.
An obtained policy refusal remains BLOCKED even if its settlement acquires the
lock after the deadline; settlement cannot replace that audit decision with an
infrastructure/timeout verdict. Cancellation before a stage timer fires remains
cancellation. In-progress duplicate admissions emit the fixed state category.

## Outcomes

Public failures retain fixed, distinct codes: RATE_LIMITED (request/attempt rate),
BUDGET_EXCEEDED (funding quota), DEADLINE_EXCEEDED (run/stage time), INPUT_BLOCKED /
OUTPUT_BLOCKED (policy), and configuration/provider/safety unavailability
(infrastructure). Before headers, rate/quota use HTTP 429, deadline uses 408,
policy uses 403 and infrastructure uses 503. After SSE headers, the fixed code's
message is sent in-band with a terminal finish; the HTTP status stays 200.
Admission and streaming logs additionally carry a fixed category and request ID,
code and duration, without prompt, draft, evidence, credentials or raw driver
errors. This is outcome classification; full stage tracing remains T20.


## Verification — 2026-10-23

- Quality checks: lint, TypeScript, 437 default tests in 45 files and a production
  build. Unit/integration coverage includes clock rollback/queue time, nonextending
  retry deadlines, stage claim uniqueness, exhausted search with unknown billing,
  retained denial counters and separate rate/quota/deadline/infra/policy logs.
- Eight opt-in development Neon cases pass through four independently held backend
  connections, including concurrent request limits, malformed HTTP requests,
  concurrent quota denials, expiry/reconciliation, restricted grants and deliberately
  blocked advisory locks. The runtime cannot extend `runs.deadline_at`, raise a
  provider cap, move counter windows or delete counter history. Five T18 Neon
  cancellation/reconciliation cases also pass after the claim-interface change.
- A 20-request contended limiter burst at concurrency four measured median 439 ms,
  p95 811 ms and max 883 ms (3,206 ms total). These are development Neon measurements,
  not production capacity or paid-model latency. The original four-admission burst
  could exceed the existing two-second lock timeout; the verified contract returns
  sanitized infrastructure 503 while retaining the independently committed abuse
  count and creating no paid hold. No lock timeout was widened or error reclassified
  as customer quota to make a test pass. Counter assertions aggregate window totals
  so a real minute boundary does not produce a false failure.
- Thirty-eight distinct browser cases pass across the incremental checks.
  Desktop/mobile checks cover rate and quota denial without run/provider
  creation, stage deadline followed by same-intent retry, and replacing a stale
  already-running warning with the terminal fallback. Existing guarded-search,
  source/citation, safety denial, Stop, reload and cross-tab recovery regressions
  pass, as do eight public/accessibility cases. Browser fixtures use synthetic
  providers in the pinned development database; no paid-provider request is made.
- In-app browser verification used the existing local session with provider keys
  explicitly disabled. The safe unavailable-provider state had zero runs, messages
  or provider calls and one committed request in each abuse window. That legitimate
  request's counters remain; no live allowance was reset. The original private
  conversations were retained, and the browser was returned to `/workspace`.
- Five fresh-cache samples per route passed the existing local performance budgets:
  max LCP 712 ms, CLS 0 and JS transfer at most 193,697 bytes across the private
  routes; public home/sign-in max LCP 104 ms. These are unthrottled local lab results,
  not field Core Web Vitals; INP and paid-provider timings were not measured.

Evidence is in ignored `.artifacts/t19-*.png`, `.artifacts/t19-neon-load.json` and
public/private performance JSON. All disposable account/budget/counter fixtures
are cleaned up by captured IDs/digests; the real account and its request counters
are retained. Dependency audit has no high/critical production advisories; the
existing moderate tooling advisory remains. Production migrations 0007–0008,
hosted cron activation, retention automation and paid-provider verification remain
separate release work. T12–T17 and the public/paid launch gates remain open.

PR #8 review corrections add regression coverage for safety timeouts at all four
gates, timer-versus-caller abort causes, answer/search cancellation, policy refusals
crossing settlement deadlines and duplicate-admission logs. The corrected suite
has 447 tests in 46 files; lint, TypeScript and production build pass. Browser
deadline checks assert the saved TIMED_OUT reason and its fixed recovery message,
as well as unchanged deadlines and provider counts on replay. An interrupted
fixture run left two test-budget rows; only its captured disposable identity,
budget IDs and subject counter digest were removed before rerunning. No real
user allowance or production data was changed.
