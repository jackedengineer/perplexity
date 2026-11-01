# Durable paid-job foundation — 1 November 2026

Scope: implement durable admission/outbox dispatch, fenced worker steps and cost
claims, owner-scoped progress replay, durable cancellation/recovery, and Razorpay
test-mode paid access. Deep Research's evidence loop and general browser actions
remain later slices. Existing FAST safety/accounting and guest behavior stay intact.
The first registered workflow is an explicitly labelled execution check: no model,
search or browser calls and no claim that research/agent work is implemented.

## Boundaries and decisions

- Keep Next.js admission/status routes short; execution runs in a separate worker.
  Trigger.dev is the managed adapter; an explicit development CLI uses the same
  consumer and leases for deterministic crash/browser testing. No fire-and-forget
  request is the only dispatch path. No paid services or live checkout enabled.
- One Neon transaction creates a job, its reservation and outbox record. Stable
  owner/idempotency key + payload fingerprint rejects changed requests. A DB lease
  generation fences stale workers; completed steps are replayed, not repeated.
- Each step has an immutable key/cap and one claimed outcome. STARTED work lost to
  a crash becomes UNKNOWN; recovery does not repeat a possibly billable call.
  Known spend settles once; unknown exposure remains held. Job reservations debit
  existing operator DAY/PERIOD counters, rather than inventing a second spend pool.
- Neutral persisted events have a monotonic per-job sequence. Reads/replay/cancel
  always authorize the current session/owner; caller-supplied owner/tier/price,
  upstream model, arbitrary step output and worker callbacks are not public inputs.
- Razorpay is test-only in this PR. A verified captured paid cycle, pinned to a
  server-owned checkout/subscription/plan, grants a separate bounded job period.
  Mandate creation or browser success alone never grants access. Test billing
  cannot create live entitlements. Live pricing/activation remains pending choice.
- Verify raw webhook HMAC before parsing, durably inbox accepted events, process
  them idempotently and reconcile provider state outside DB transactions. Duplicate
  events for the same payment/invoice grant once. Revocation prevents new work;
  cancellation retains already-paid coverage through its end. Unknown checkout
  creation blocks another billable subscription until reconciled.
- New features default off. Expose the execution check and sandbox checkout only
  in a dedicated development/test configuration. Never sell incomplete research.
- Keep the existing $2 OpenRouter cap. This foundation needs no paid AI requests.
  Trigger development and Razorpay TEST credentials are configured locally. Credentials
  belong only in ignored local files and server settings, never chat or commits.

## Ordered increments

1. [x] Define versioned contracts and additive schema; generated migration and
   restricted grants. Prove strict inputs, uniqueness, ownership and billing/job
   period constraints against migrated PGlite before committing.
2. [x] Implement atomic job admission, shared operator reservations, ordered events
   and dispatch claims. Prove idempotent admission, budget denial and crash-safe
   outbox re-delivery; never put provider calls inside a DB transaction.
3. [x] Implement fenced step claims/outcomes, checkpoints, terminal settlement,
   cancellation and bounded stale recovery. Prove stale/duplicate workers cannot
   commit or release UNKNOWN holds, and cancellation wins against late completion.
4. [x] Connect Trigger.dev and the development worker to the same consumer;
   authenticated dispatch, conservative retry limits, expiry and maintenance.
   Verify process restart and duplicate delivery with real development Postgres.
5. [x] Implement owner HTTP admission/status/event replay/cancellation and a
   disabled-by-default execution-check UI with loading, retry and error states.
   Verify refresh/reconnect, owner isolation, stop and recovery in desktop/mobile.
6. [x] Add Razorpay test checkout, verified-cycle entitlement, durable webhook
   inbox/reconciliation and billing status/cancellation UI. Test forgery, duplicates,
   out-of-order/reversed events, wrong environment/plan/currency, paid-through and
   unknown creation. Connect actual test credentials when browser setup is ready.
7. [ ] Run final lint/types/offline tests/build/browser and development Neon checks;
   inspect secrets/bundles, record cleanup and limits, update release checklist,
   push focused commits and open one PR. No merge/production activation requested.

## Sources checked

- Next 16.4.2 bundled route/environment/after guides. `after` is duration-bounded
  and cannot be the durable worker; use the persisted outbox plus worker/schedule.
- [Trigger tasks](https://trigger.dev/docs/tasks/overview) and
  [Next.js integration](https://trigger.dev/docs/guides/frameworks/nextjs).
- [Razorpay Subscriptions](https://razorpay.com/docs/payments/subscriptions/integration-guide)
  and [raw-byte webhook verification](https://razorpay.com/docs/webhooks/validate-test).

Acceptance is scoped to the foundation, not full T26 research quality or arbitrary
browser-task execution. Provider sandbox, hosted scheduling and live billing checks
must be recorded honestly if credentials or merchant activation remain unavailable.

## Verified handoff

- Real TEST ₹999 capture, invoice-verified ten-check access and renewal cancellation
  passed in the in-app browser. The shared Razorpay key was not regenerated.
- Four final desktop/mobile job/webhook cases pass, including owned Stop, Back,
  reload, reduced motion, full-page accessibility and no hydration errors.
- Three final real PostgreSQL/process cases pass in 58.89 s; all captured
  synthetic fixtures and their zero-dollar namespace were cleaned.
- Local 705-test full run, latest 19 targeted cases, lint/types/build, 10 default
  browser cases, 12 answer-motion cases and high/critical audit gates pass.
- Hosted scheduler/webhook delivery, billable executors, live feature activation
  and final GitHub CI/review remain explicit release gates.
- [x] Focused implementation commits pushed to the requested GitHub repository.
- [ ] Open the verified foundation PR and attach its CI/review handoff.

Detailed evidence and limitations: [release checklist](../docs/release-checklist.md).
