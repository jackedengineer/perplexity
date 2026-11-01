# Hosted sandbox verification — 1 November 2026

Scope: hosted execution and payment plumbing for the execution-check foundation.
Deep Research, autonomous browser tasks and live purchases remain disabled.

## Deployment and isolation

- Reviewed runtime: merged PR #18 (`fdfd03b` / application code `93d60e2`).
- Trigger cloud version `20261101.1`, in its environment labelled **Production**.
  This label does not mean application production: the worker uses only the
  pinned development Neon database, restricted `perplex_web` role, a unique
  `test-hosted-*` namespace and Razorpay TEST credentials. No AI keys were copied.
- Vercel rebuilt the reviewed `codex/durable-paid-jobs` preview with branch-only
  secrets. Its stable branch alias remains Vercel-protected. The development
  Google client has only the additional exact preview callback; production OAuth
  credentials, audience settings and application production flags were unchanged.
- The named Trigger key expires 1 December 2026. Worker settings are redacted
  secrets. Ignored local configuration has mode 0600. No shared key was rotated.
- The user approved a temporary protection exception only for immutable preview
  `perplexity-cgpia9ezi-chiragbhugras-projects.vercel.app`, enabling provider delivery
  to `/api/webhooks/razorpay`. After verification, the new webhook was disabled and
  this exception removed. The existing retired-host exception and QuickBus webhook
  remain unchanged. An unauthenticated probe again redirects to Vercel sign-in.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Hosted dispatch and completion | Pass | Three persisted checkpoints, zero held/spent provider dollars |
| Terminated cloud execution | Pass | Queued a delayed recovery command before termination; cloud recovery resumed without repeating the committed checkpoint |
| Owner cancellation | Pass | Hosted worker fenced; no late completion |
| Actual Razorpay-origin delivery | Pass | Created and immediately cancelled a disposable unpaid TEST subscription; verified cancellation receipt reached APPLIED; no access granted |
| HTTPS forgery and duplicate delivery | Pass | Invalid signature rejected; identical signed deliveries acknowledged with one durable receipt |
| Interrupted inbox lease | Pass | Only the captured synthetic receipt was assigned an expired processing lease; hosted maintenance reclaimed it, applied once and cleared its lease |
| Hosted browser | Pass | Google sign-in, billing status, progress, reload/replay, completion and persisted Stop; no captured console warnings/errors |
| Public production boundaries | Pass | Canonical entry/retired-host probes pass; production job/billing APIs remain 404 |

Three cloud worker cases pass in **168.14 s**; three hosted billing cases pass in
**25.36 s**. Private ignored logs: `.artifacts/hosted-worker-checks-final.log` and
`.artifacts/hosted-billing-checks-final.log`. The earlier two-case billing run also
passed, but does not cover the added inbox-lease case. The earlier worker run
also passed in 173.11 s; the final run additionally covers the namespace cleanup guard. In-app browser screenshots
and the final two-job accounting snapshot are in `.artifacts/hosted-*`.

The browser's completed execution has one terminal completion event; its cancelled
execution has none. Both have zero held/spent provider dollars. Their history and
zero-dollar operator ledger remain recorded; no existing financial rows were reset.
Disposable test-run identities, subscriptions' local mappings and captured inbox
receipts were cleaned only by their captured IDs. The remote TEST subscriptions
were confirmed cancelled before cleanup; no payment/card/customer was supplied.

A separate negative probe verifies that reusing a namespace fails before cloud
work and leaves its existing ledger unchanged. Its deliberately nonzero test-run
exit is expected precondition evidence, not a passing execution run. Cleanup only
deletes an operator namespace successfully created by that invocation.

## Repeating the checks

Use the explicit development owner/runtime guards in `vitest.neon.config.ts`.
The hosted worker suite additionally requires `LIVE_HOSTED_JOB_CHECKS=1`, an
approved expiring `tr_prod_sk_` key in ignored `.env.jobs.hosted.local`, and a
**fresh** unique `test-hosted-*` key configured on that hosted environment. The
suite provisions only zero-dollar test windows and refuses an existing ledger.

The billing suite additionally requires `LIVE_HOSTED_BILLING_CHECKS=1`, the TEST
credentials in ignored `.env.local`, and an enabled, approved provider webhook for
its pinned immutable HTTPS target. It cannot run successfully against the restored
protected target without preparing another authorized test window. It never retries
an ambiguous subscription-create POST or discards an unconfirmed cancellation.

No local consumer or dispatcher was running during the cloud worker checks. These
opt-in operational suites are excluded from ordinary offline/CI test execution.

## Remaining release gates

1. **Automatic dispatch/recovery:** these checks trigger maintenance explicitly or
   by a prequeued delayed cloud command. They do not establish a recurring
   production scheduler or automatically dispatch every application submission.
   Trigger's free plan cannot use Staging and new cron schedules have an hourly
   minimum cadence/window. That cannot service the two-minute execution-check
   deadline. Wire and verify a suitable recurring dispatcher and/or durable
   per-job watchdog before paid availability; no plan upgrade was purchased.
2. **Paid work:** implement and evaluate the Deep Research evidence loop/report
   and browser-task executors, isolation and action approvals. The only executable
   manifest remains `execution-check-v1`; there are no billable adapters yet.
3. **Billing acceptance:** real hosted TEST capture, renewal/refund/dispute lifecycle
   and provider redelivery after an endpoint outage remain separate checks. Signed
   duplicate delivery and expired inbox recovery do not prove provider retry
   behavior. Complete merchant activation, live price/allowance policy, retention,
   cancellation/refund terms and LIVE/TEST separation before enabling sales.
4. **Production rollout:** provision reviewed worker secrets/runtime roles and job
   budgets; apply migrations 0025–0027 and grants through the owner workflow; verify
   restore/rollback and hosted latency/mobile acceptance. No production migration
   ran here. Current
   cloud executions use US East while development Neon is in Singapore; the
   observed system-check execution overhead needs profiling before setting an SLO.
   The in-app viewport override retained a rendered width of 1280px when
   390px was requested, so that attempt is not counted as hosted mobile acceptance.
   Existing local desktop/mobile checks are separate evidence.

The existing **$2 combined OpenRouter cap**, production budgets, expiry and unknown
cost holds are unchanged. These checks made no OpenRouter or Tavily requests and
moved no real payment funds. Trigger execution used its existing free-plan compute
credits; no paid upgrade, new purchase or live payment activation was selected.

Sources: [Trigger deployment environments](https://trigger.dev/docs/deployment/overview),
[free-plan schedule policy](https://trigger.dev/docs/tasks/scheduled),
[run cancellation](https://trigger.dev/docs/runs),
[Razorpay webhook setup](https://razorpay.com/docs/webhooks/setup-edit-payments),
[immediate subscription cancellation](https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription).
