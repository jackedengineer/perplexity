# T19 distributed usage and deadline contract

Postgres remains the shared authority. This task extends T05 admission and T18
recovery without adding Redis, anonymous trials, paid entitlements or provider
retries. Paid testing and production deployment remain pending.

Submission requests consume a separate abuse allowance before body validation,
provider configuration or run admission. Malformed, unowned, unavailable, blocked,
quota-denied and duplicate requests count. Verified subjects share counters across
sessions/processes. Unauthenticated submissions share one bounded service bucket;
no browser identity, forwarded IP, new cookie or request key creates an allowance.
Only digested scope keys and minute/day metadata are stored, never request text.
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
