# Direct Google sign-in and footer — 3 November 2026

- [x] PR #28 merged after clean code/security reviews and both Quality CI jobs.
- [x] Direct Google login completed in the live browser without an intermediate
  marketing sign-in page. Legacy sign-in links return to the workspace.
- [x] Policy footer reaches the bottom on 390×844 and 390×560 mobile viewports,
  without overlapping the composer. Unauthenticated private APIs remain denied.
- [x] Budgets, existing holds and provider usage unchanged; no paid AI calls.

See [production acceptance](workspace-entry.md) for test counts, opt-in test
limitations, Worker version and rollback.

# Workspace entry release — 3 November 2026

- [x] PR #27 merged after clean current-commit code/security reviews and Quality CI.
- [x] Visitor workspace, highlighted sign-in, authenticated entry/sign-out and
  desktop/mobile sidebar transitions verified on the live Cloudflare domain.
- [x] Both navigation regressions fixed: staged questions and model/mode selections
  survive the workspace-to-chat route transition; transport browser tests pass.
- [x] No migrations, budget changes or paid AI calls for this release.

See [workspace entry acceptance](workspace-entry.md) for the Worker version, test
counts and rollback. Earlier paid-account and cancellation acceptance limits below
are unaffected by this UI release.

# Graphite release checkpoint — 3 November 2026

See [Graphite release](graphite-release.md) for feature behavior, verification,
production migration order and rollback. PR #26 merged after clean CI and both
reviews; migrations 0031/0032 and Worker `81951d40-d983-4808-b104-60be2aa7ba14`
are live. Model search/favorites/costs, pins/history search, Chat/Web, revisions,
citations and responsive layout passed live checks. Deep Research's Free-account
gate passed; Pro display uses approved fixtures. A new admitted cancellation test
is pending because the test account reached its unchanged five-answer daily cap.
No budgets or unknown-cost holds were changed. The November 5 ordinary-key expiry
and real paid-account/first-payment acceptance remain outstanding.

# Current release checks — 2 November 2026

## Follow-up payment capacity check — 13:55 UTC

- [x] PR #24's cancellation adapter passed all 866 tests, lint/types, the
  Cloudflare build, both Quality CI jobs and code review; it deployed as Worker
  `d9f99d02-2ec0-4e4a-b2ef-5537aee84c85` and billing reloaded successfully.
- [x] Security review reproduced a completed-payment race: cancellation could
  mark checkout COMPLETED before invoice reconciliation, temporarily freeing the
  sole funded pilot seat. New checkout starts were paused while fixing it;
  guest/signed-in research and existing billing access remain available.
- [x] The capacity gate now retains COMPLETED subscriptions without a recorded
  LIVE period. The regression failed before the fix and then passed: delayed
  invoices cannot release capacity or fabricate access; native reconciliation
  grants the real seven-report period and holds capacity until paid-through ends.
- [x] Both early-refund and early-dispute regressions failed before their fix.
  Reconciliation now records verified reversed invoices as REVOKED periods,
  releasing their seat without ever granting access. An unlinked reversal alone
  still cannot release capacity. Repeated reconciliation preserves revocation.
- [ ] Final CI and fresh code/security reviews for this capacity fix.
- [ ] Deploy and verify the capacity fix, then restore the approved live checkout.
- [ ] A real customer must complete the first captured payment; no agent-created
  charge, mandate, refund or LIVE entitlement is part of these checks.

## Launch acceptance update — 13:43 UTC

- [x] PR #21 merged as `d5fd5e010834fc36e9fcc7c7ad5de97e11e25c4d` after
  Quality CI and both exact-head code/security reviews passed; all threads resolved.
- [x] Reviewed fixes deployed as Worker version `2cbd8e42-4a84-48c8-b121-4519eb59295c`.
  Production live checkout is enabled. The browser opened the real Razorpay ₹999
  payment screen; provider readback confirms LIVE mode, one cycle and zero payments.
- [x] Guest-to-Google transfer preserved the guest conversation on the custom
  domain. Public pages, private API denials and unsigned webhook rejection pass.
- [x] The verification checkout was cancelled with no payment, mandate, refund or
  paid grant. Native reconciliation observed provider CANCELLED and released the
  sole pilot seat. The real signed `subscription.cancelled` webhook was APPLIED
  after one attempt, without a fabricated event. The test account's 24-hour
  new-checkout cooldown stays intact.
- [x] Opening and abandoning checkout exposed a timing bug: Razorpay rejects
  cycle-end cancellation for CREATED subscriptions. Immediate cancellation was
  verified on that exact unpaid subscription. The follow-up adapter reads current
  state, uses immediate cancellation only for CREATED, preserves cycle-end timing
  for paid states and treats terminal states idempotently. Regression tests cover
  these states and reject failed/mismatched reads before mutation.
- [ ] Follow-up cancellation fix CI/review and deployment acceptance.
- [ ] A customer-completed real payment and captured-invoice entitlement remain
  untested. Do not confuse opening LIVE checkout or cancelling an unpaid intent
  with a captured payment. No agent-created LIVE entitlement exists.

The application is public and the one-customer paid pilot is open; the older
checkpoint below describes its pre-activation state. Ordinary research still has
its November 5 expiry and daily $0.40 bound. The independent paid pilot remains
$5 total through December 12, one month and no automatic renewal. Browser Tasks
remain unavailable. Temporary hosted acceptance worker was removed; financial
usage and unknown holds were retained.

## Cloudflare public launch and bounded paid pilot

- [x] `https://perplexity.jacked.dev` is live on Workers Paid near Singapore Neon.
  Production migrations 0025–0030 and restricted runtime grants pass. Google and
  temporary reviewer sign-in were exercised; the retired Vercel entry remains.
- [x] Public guests are enabled behind Turnstile. A fresh guest answer about bee
  pollination rendered citations, consumed two of six trial credits, and survived
  reload. That guest cannot read the separate reviewer's private conversation.
- [x] Fresh signed-in Moon-phases research completed in approximately 22 seconds
  with five citations. The following solar-panel request was stopped in the real
  production browser; database state is CANCELLED and no answer credits were spent.
- [x] Ordinary operator PERIOD ceiling changed only with explicit owner approval
  from $1 to $1.70. Daily $0.40, November 5 expiry, spend and unknown holds remain.
  The ordinary provider envelope remains $2 including the retired-key allowance.
- [x] Approved dedicated OpenRouter pilot key exists: $5 TOTAL, non-resetting,
  December 12 expiry. The approved account maximum lifetime is now 90 days;
  existing keys were not extended. Temporary management key disabled and its
  management API access independently rejected; local temporary secret removed.
- [x] Isolated `live-pilot-20261102` operator period funded at $5 through December 12,
  daily ceiling $0.40; dedicated Tavily key permits 150 free monthly credits with
  pay-as-you-go off. No credit purchase, automatic top-up or new plan upgrade.
  Combined authorized provider exposure is at most $7, not an unbounded budget.
- [x] Actual native production minute cron observed idle skip and wake-up. A real
  maintenance cycle completed at 13:14:28 UTC; readiness is not a fabricated row.
  Dedicated paid keys, invocation-owned database pools, fenced Postgres claims and
  independent billing/recovery remain enforced. No public production runner route.
- [x] Razorpay explicitly approved the custom domain. Independent signed LIVE
  webhook enabled for eight supported events; unsigned deliveries rejected.
  No real customer charge, mandate, refund or fabricated LIVE receipt was created.
- [x] Three earlier review findings fixed: paid-model admission parity, billing
  reads/cancellation during KV failure, and durable per-account checkout cooldown.
- [x] New cancellation-abuse regression reproduced and fixed. A LIVE paid period
  permits 14 billable started attempts, separately from seven delivered reports.
  Deletion cannot reset this count; cancellation before dispatch is excluded.
  Public pricing, terms and Billing disclose this limit.
- [x] First hosted real Deep Research attempt reached all six searches and evidence
  approval, then hit the shared 12-second answer timeout. Unknown cost remains held.
  Deep Research now has a bounded 45-second drafting window; ordinary answers retain
  12 seconds. Tokens, pinned providers, no retries, Stop and job deadline unchanged.
  Synthetic delayed-response and cancellation/deadline regressions pass.
- [x] Before those final two fixes: lint/types, 851 offline tests, 12 Cloudflare and
  10 Next.js desktop/mobile checks pass. OpenNext build and credential scan pass
  (1,776 files, 14 values, zero matches). Upstream Better Auth warnings remain visible.
- [x] Final lint/types, 854 tests in 129 files and OpenNext build pass. Final
  credential scan: 1,776 files, 14 values, zero matches.
- [ ] Exact-head CI and fresh code/security reviews after these fixes.
- [x] Hosted Deep Research produced a three-section cited report in about 68 seconds;
  browser reload recovered saved progress/report and Copy report confirmed success.
  Settled exposure is 111,034 microUSD, including conservative search accounting,
  with zero unknown hold. The earlier failed attempt retains its 14,000 microUSD
  hold; neither failure nor spend was erased. This is one functional live sample,
  not a comprehensive factual-quality evaluation.
- [x] A separate zero-AI hosted execution was stopped while RUNNING in the browser;
  terminal CANCELLED persisted. Isolated development Neon/TEST entitlements only;
  this does not claim a real LIVE payment or customer report grant.
- [ ] Final live checkout UI and native payment lifecycle acceptance. Checkout stays
  paused until funded fulfillment checks pass; do not complete a real payment
  autonomously. Browser Tasks remain excluded. Razorpay LIVE key rotation was
  explicitly deferred by the owner and is not represented as completed.

**Current access:** public site, Google/reviewer sign-in, ordinary AI research and
Turnstile guest trials are live. Deep Research worker/admission is configured but
requires a verified paid period; real checkout remains OFF. The pilot offers one
customer one ₹999 monthly cycle, seven completed reports, at most 14 started
attempts and no automatic renewal. Ordinary funding expires November 5; pilot
funding expires December 12. Neither is a promise of unlimited public capacity.

Private evidence: `.artifacts/production-answer-stop-verified.json`,
`production-guest-answer.png`, `ordinary-period-170-approved.json`,
`openrouter-pilot-verified.json`, `openrouter-management-revoked.json`,
`pilot-budget-provisioned.json`, and the hosted proof/test logs. Never publish
credential files, raw request-tail headers/cookies or database backups.

## Earlier preparation checkpoints (superseded by the checkpoint above)

## Cloudflare production pilot — November 2 follow-up

- [x] Workers Paid confirmed active; PR #23 merged after exact-head CI and clean
  code/security reviews as `42309f5`.
- [x] Production-mode and funding gates, single-cycle checkout, independent minute
  dispatch/worker health, and accounting-preserving content lifecycle implemented.
- [x] 809 offline checks and eight production-build browser cases pass at the
  preparation checkpoint. Native development-Neon checks use synthetic providers;
  they are not hosted LIVE payment or AI acceptance.
- [x] Catch OpenNext's copied local env before upload; add nine build-env guards,
  rebuild credential-free and verify zero configured credential matches in 1,808
  generated/static files. Existing adapter warnings remain recorded.
- [ ] Final candidate CI/reviews, bounded credential grants, production migrations
  0025–0030/grants, hosted worker/scheduler/payment checks and domain cutover.
- [ ] Enable real checkout only when the paid worker, fund window and native
  financial recovery are ready. Tasks remain excluded from the offer.

This checkpoint supersedes older Vercel-only staging statements below. Exact
evidence, the retained failed development run and pending actions are in
[the pilot task record](../tasks/cloudflare-paid-pilot.md).

## Live Razorpay preparation — November 2 follow-up

- [x] Approved merchant website visibly verified in Razorpay. Owner-approved first
  Live key created after SMS handoff; read-only API authentication passes. ₹999 INR
  monthly plan created once and independently read back. No subscription/mandate,
  charge/refund, paid AI request, plan upgrade or budget increase was performed.
- [x] API credentials saved only in ignored owner-only local configuration and
  Vercel Production Secret settings. Existing TEST preview/QuickBus configuration
  is unchanged. Rotate the secret supplied in chat before accepting payments.
- [x] Explicit TEST/LIVE offers, mode-bound checkout/period FK and ledger identities,
  server-verified seven-run grant, isolated reversals, replay-safe reconciliation
  and cancellation with paid-through retention. Billing recovery stays usable
  with inference/new-purchase admission off; LIVE purchases remain closed in code.
- [x] Migration 0029 applied to development only; synthetic restricted Neon checks
  pass 2/2. Offline suite passes 765/765 plus the later migration-upgrade regression;
  public browser cases pass 4/4. Real browser checks of BillingConsole pass at
  desktop and 320px with no overflow or captured console warnings/errors. The
  disposable local UI route was removed. Build/lint/types and high/critical audit pass.
- [ ] Exact-head CI/code/security reviews and merge for this billing candidate.
- [ ] Reviewed production 0025–0029 migrations/grants, rotated secrets, production
  worker/automatic dispatch and minute recovery, signed merchant webhook, hosted
  payment lifecycle and paid-content/rollback/latency acceptance.
- [ ] Commercial hosting and funded delivery window/capacity/renewal controls.
  Vercel currently reports Hobby. The owner requested a monthly operating-budget
  proposal, not authorization to buy plans or raise the current $2 cap. The
  [proposed first paid month](live-billing-activation.md) is not activated.

## Cloudflare CPU follow-up — November 2

- [x] Cookieless fast denial and read-only public prerender cache implemented;
  private responses, verification, budgets and cancellation remain intact.
- [x] Exact build/population command, lint/types and 771 offline tests pass.
- [x] 42 browser checks pass: 12 local workerd, eight development-Neon,
  12 isolated hosted public and ten Node desktop/mobile cases.
- [x] Measured gains, reverted experiments, raw-analytics units and incomplete
  windows are recorded in [the CPU report](cloudflare-cpu.md).
- [ ] **Free production acceptance:** hosted tail estimates still exceed 10 ms;
  controlled analytics windows are incomplete, and authenticated hosted CPU,
  fresh research/worker and financial acceptance remain unverified.

Decision: **HOLD production cutover.** The isolated preview is updated; production
DNS, payments, credentials, migrations and the $2 combined cap are unchanged.
This follow-up supersedes the initial proof's counts below, without clearing any
of its open production gates.


## Cloudflare compatibility proof — November 2

- [x] Pinned adapter/CLI; OpenNext build, lint/types and 757 offline tests pass.
- [x] Local workerd: 10 public browser cases and eight development-Neon browser
  cases cover sessions, concurrency, ownership, saved citations, approved SSE
  replay, progress recovery and durable cancellation. Provider fixtures are synthetic.
- [x] Isolated Workers Free public preview: ten desktop/mobile browser cases pass;
  no working DB/OAuth/provider/payment credentials, schedule or custom domain installed.
- [x] Hosted size/startup and first CPU/wall-time sample recorded in the
  [proof report](cloudflare-compatibility.md#november-2-proof-results).
- [ ] **Free CPU acceptance:** first P50 14.871 ms/P99 258.282 ms exceed the
  documented 10 ms allowance. No sustained Free production fit is established.
- [ ] Real hosted Google/Neon isolation, fresh research delivery, worker recovery,
  payment acceptance and adequately funded monthly delivery remain cutover gates.
- [ ] Final domain migration: owner authorized replacing old Railway after checks;
  `perplexity.jacked.dev` remains unchanged while the CPU/hosted gates are open.

Decision: **HOLD Cloudflare production cutover and paid activation.** No paid
upgrade, provider call, real payment or $2-cap change occurred in this proof.
The following records describe earlier work and do not supersede these gates.


## Temporary reviewer login — November 2 follow-up

- [x] Owner explicitly authorized one seven-day reviewer-only password login.
  Native salted password hashing, exact subject/email/origin binding, account
  creation-time binding, capped session expiry/renewal and fail-closed application
  session validation are implemented. Public registration/recovery/password
  changes and reviewer profile/social linking are denied. Guest history is not
  transferred to the shared reviewer. No admin or paid-access bypass is granted.
- [x] **750/750** offline tests, lint/types/production build; **2/2** actual
  development Neon desktop/mobile login, ownership and expiry browser cases;
  **10/10** default-off production-build cases including reviewer-route 404.
  Synthetic client IPs isolate test attempts; the five/minute limit is unchanged.
- [x] Real in-app reviewer login reaches a fresh development workspace with no
  owner conversations or captured console warnings/errors. Provider keys are
  deliberately absent in that fixture; this is login verification, not AI testing.
- [x] Production operator utility created the requested fresh reviewer identity
  transactionally, with a native password hash and no subscription/budget writes.
  The ignored receipt contains no plaintext password. Existing emails/subjects
  are never adopted or overwritten. [Operations and revocation](reviewer-access.md).
- [ ] Exact-candidate CI and code/security reviews; production deployment,
  reviewer setting activation and actual hosted sign-in/ownership acceptance.
  Database creation alone does not mean credentials are already usable online.

The combined **$2** cap, account/operator ceilings and existing financial holds
remain unchanged. No paid AI calls or financial transactions ran in this follow-up.

Decision: **HOLD full release acceptance.** The public site and guest entry are
already deployed. This section supersedes historical status below. The original
record is also retained in [the October 23 checklist](release-checklist-20261023.md).

## Deep Research extension — reviewed activation still pending

- [x] PR #20 merged at `bcfd3ea510644b89c30cd9f480ae45ef8fd91751`. Both fresh
  exact-head reviews completed, Codex posted its clean-review confirmation, all
  threads were resolved and Quality run 41335650275 passed on `3259ac7`.
- [x] Reproduce/fix denial checkpoint recovery and unsafe extraction fallback.
  Denial receipt and terminal settlement now commit atomically; legacy saved
  denials cannot advance; explicitly rejected sources never reach drafting.
  New candidate: **737/737 offline**, **4/4 actual development PostgreSQL**,
  lint/types/build, **2/2** report browser and **10/10** default-off browser cases.
  No paid provider requests were made for this review-fix verification.
- [x] Owner confirmed ₹999/month and seven Deep Research runs; no voluntary
  refunds, with statutory remedies preserved. Operator/contact confirmed.
- [x] Vercel production deployment `dpl_kdiZfk1LVBKh3Ftzjb1EaWHi74EN`
  reports Ready for merged `bcfd3ea`; canonical live workspace, model/quota
  rendering and captured browser console pass. Six public entry probes pass.
  This is deployment acceptance, not public Deep Research activation.
- [x] Pricing/About/Contact/cancellation-refund drafts: production build, lint,
  types and **4/4** desktop/320px browser cases, WCAG checks, public navigation
  and disabled job/checkout boundaries. Drafts remain on a separate launch branch.
- [ ] Publish final reviewed merchant pages and arrange Google-only reviewer
  access. Razorpay SMS verification completed; website approval and Live keys
  are now confirmed in the November 2 follow-up above; paid activation is pending. Seven-run LIVE entitlement is not implemented by changing
  the existing ten-job TEST allowance. [Activation record](paid-research-launch.md).

- [x] Versioned strict submission and immutable private snapshots/checkpoints;
  paid TEST access, one active owner job, shared operator reservations and
  exact payload idempotency. Migration 0028 and grants applied in development only.
- [x] Six gated searches in two planning rounds, thirty-candidate ranking,
  selected-page extraction with explicit snippet fallback, bounded three-section
  drafting, citation validation, per-section and assembled-report output safety.
  Official-documentation requests restrict reviewed domains at provider and server.
- [x] Atomic step receipts/checkpoints and final publication/settlement; duplicate
  delivery, restart from saved output, stale workers, unknown-cost holds, owned Stop
  and revoked/expired access remain fenced. Unknown paid work is not auto-retried.
- [x] Submission kick, durable watchdog-before-execution, deadline-bounded watch
  chain and opt-in independent minute maintenance. Local supervised polling was
  exercised automatically; this does not establish hosted minute-schedule acceptance.
- [x] Real restricted-role development PostgreSQL recovery/immutability checks:
  **2/2 in 66.05 s** (`.artifacts/deep-neon-verified.log`). A prior assertion
  incorrectly checked the wrapped error text; final proof checks SQLSTATE 42501.
  The interrupted connectivity run is not a pass; captured synthetic leftovers
  were cleaned without deleting live research history or financial holds.
- [x] Real in-app live report: **26/26 steps**, **106.683 s**, three approved
  sections, citations only on sqlite.org/postgresql.org, full reload, export and
  clean captured browser console. Separate live Stop persists after reload and
  has no late report/completion. Current report holds zero uncertain cost.
- [x] Desktop/mobile report presentation, source links, export, Stop/reload,
  accessibility, no horizontal overflow, reduced motion and hydration checks.
  Transport-simulated presentation cases are distinguished from the real live run.
- [x] Final offline suite: **732/732 across 99 files in 100.96 s**, serial
  execution with unchanged assertions/deadlines and no skipped cases. The prior
  parallel attempt hit two PGlite startup-hook deadlines and is not a pass.
- [x] Final lint/types/production build pass. **10/10** isolated public/default-off
  production-build browser checks pass in **8.1 s**; high/critical audit gate passes
  (one moderate production advisory remains; no dependency was added).
- [x] Existing answer-motion browser regression: **12/12**. Fix the older rate-limit
  fixture's wall-clock dependency and explicitly test minute rollover with retained
  denial counts; production rate limits and all original assertions stay intact.
- [x] Bound stalled client queries/idle pool errors. Redact a failed private test
  log that serialized connection details, rotate the development owner credential,
  and update ignored local connection files. Runtime/production credentials unchanged.
- [x] Preserve the combined **$2** cap: replacement key still **$1.80**, non-resetting,
  expires November 5. Final key metadata: usage $0.059538241 / remaining $1.740461759.
  The temporary two-hour development namespace ceiling was $0.40, then $0.42 and
  $0.55 to reserve the follow-up checks. Its prior spend and **$0.026 unknown-cost
  holds** remain recorded. This changed no production/operator/account ceiling.
- [ ] Approved hosted worker credential installation,
  independent minute cadence and crash/recovery tests on the deployed candidate.
- [ ] LIVE billing/allowances, paid-job retention/export/deletion policy, production
  migrations/grants/rollback and hosted performance; broader research-quality evals
  and audited unknown-cost resolution. Deep Research is not yet publicly sold.

The first live attempt failed refinement, another was interrupted by Neon, and an
initial completed report preferred secondary sources despite the requested official
material. These do not count as passing the final quality policy. The corrected
primary-source run above passes that bounded example; it is not a comprehensive
accuracy benchmark. [Scope, setup, limits and rollout](deep-research.md).

## Hosted execution-check sandbox follow-up

- [x] Deploy reviewed worker code to Trigger cloud using development Neon and
  Razorpay TEST credentials only; no AI keys, production migration or live sale.
- [x] **3/3** hosted worker cases (168.14 s): completion, terminated-run recovery
  from prequeued delayed cloud delivery, and owner cancellation.
- [x] **3/3** hosted billing cases (25.36 s): genuine provider-origin cancellation,
  no unpaid access, forgery/duplicate handling, and expired inbox-lease recovery.
- [x] Protected preview browser: Google sign-in, billing, progress, full reload,
  completion and persisted Stop. No captured console warnings/errors; both
  browser runs settle zero provider dollars and cancellation has no late completion.
- [x] Disable the temporary test webhook and restore its exact-host Vercel protection;
  preserve QuickBus and the existing retired-host redirect/exception. Public
  production entry probes pass and paid job/billing APIs remain disabled.
- [x] Reject reused test namespaces before cloud work without deleting their ledger.
- [ ] Recurring automatic dispatch/recovery at an adequate cadence; paid executors
  and quality/safety evaluation; full hosted billing lifecycle/provider-outage retry;
  production migrations, live merchant/allowance policy, rollback and latency acceptance.

[Isolation, evidence, repeat procedure and remaining gates](hosted-sandbox-verification.md).
The $2 cap, production ceilings and unknown-cost holds are unchanged. No paid AI
requests ran. A delayed cloud recovery test is not recurring scheduler acceptance.

## Durable job and paid-access foundation — test only

This change does not open Deep Research, browser tasks or live purchases. Both
new feature flags remain off by default and reject Vercel production. Existing
FAST research, guest behavior, the $2 OpenRouter cap and production financial
holds remain unchanged. [Architecture, setup and limits](durable-jobs.md).

- [x] Atomic owned admission/reservation/outbox, immutable step identities,
  generation fencing, checkpoint replay, cancellation, expiry and conservative
  known/unknown-cost settlement. Compound FKs bind owner and budget snapshots.
- [x] Real restricted-role development Neon: all three concurrent-admission,
  actual worker-process crash/restart and cancellation cases pass on the final
  engine in **58.89 seconds**. Synthetic rows/namespaces are cleaned. Earlier
  successful run: 70.55 seconds; neither run uses paid AI calls.
- [x] Trigger Development registers both tasks and consumes real outbox deliveries.
  Browser reload before/during execution, completion and persisted Stop pass.
  Only the explicit execution-check workflow is registered, not a research agent.
- [x] Razorpay TEST: selected ₹999/month Pro plan, actual test-card capture,
  server-fetched invoice/payment verification, ten-check test entitlement and
  renewal cancellation retaining paid-through coverage. The shared test API key
  was copied from the user's other local project without regenerating it.
- [x] Four final desktop/mobile development browser cases pass in **2.7 minutes**:
  paid/owner isolation, reconnect/reload/Back replay, cancellation/completion,
  full-page accessibility, reduced motion, no hydration errors, and raw webhook
  HMAC/forgery/duplicate/conflicting-ID checks. Local signed HTTP delivery does
  not establish provider-origin hosted webhook delivery.
- [x] Existing production-build browser checks pass: **10 public/disabled-boundary
  cases (8.5 s)** and **12 answer-motion cases (1.1 min)**. Word reveal/citations
  and default-off paid boundaries retain their previous behavior.
- [x] Full serial offline run: **705/705**; the latest focused configuration,
  accounting and billing run: **20/20**, including the additional invoice-order
  regression and an accepted-but-unconfirmed provider-create failure. Lint/types and production build pass. The first concurrent local
  run encountered PGlite startup timeouts and was stopped; it is not a pass.
  Original assertions, hook deadlines and CI concurrency gates remain unchanged.
- [x] Dependency audit has **no high/critical** findings (four moderate development
  advisories remain). Patched CLI transitives are pinned; its TypeScript 5 peer
  is isolated from the application's TypeScript 6 without suppressing checks.
- [x] Local metadata API timings: desktop 20 samples, p50 902 ms / p95 1591 ms /
  max 2196 ms; mobile 22 samples, p50 927 ms / p95 1910 ms / max 2087 ms. These are
  unthrottled development-Neon request durations, not hosted research latency,
  field INP or a production SLO. The execution check deliberately waits at each
  checkpoint and makes no provider inference/search request.
- [x] Open [PR #18](https://github.com/jackedengineer/perplexity/pull/18) with focused commits and documented launch gates.
- [x] Address all three initial PR #18 code findings in separate commits: retry
  read-only plan failures before creating an intent; back off failed oldest
  checkouts; atomically revoke full/partial refunds found by polling and retain
  reversal tombstones against delayed captures. All four new regressions were
  reproduced before fixing; malformed/mismatched refund observations retain access.
- [x] Review-fix verification: **711/711** offline tests, **19/19** focused billing/
  worker cases, lint and types pass. The unchanged desktop/mobile Neon browser
  suite passes **4/4 in 2.6 minutes** (`.artifacts/pr18-review-browser-verified.log`).
  The first run's mobile denial returned the correct 402 in 6.5 s, exceeding its
  existing five-second assertion; that failed trace is retained and is not a pass.
  No assertion, timeout, retry setting or financial limit was weakened. In-app
  billing refresh and persisted completion replay also passed. No paid AI calls.
- [x] Quality CI and both independent reviews pass on `93d60e2`; all three threads
  resolved. PR #18 merged as `fdfd03b`, preserving the focused commits.
- [ ] Before enabling actual paid features: implement/evaluate the Deep Research
  evidence loop and browser-task approvals/executors; provision reviewed live
  manifests and separate search/browser/compute limits; verify hosted scheduler
  recovery and HTTPS Razorpay webhook retries/lifecycle; review billing retention,
  terms/taxes/refunds and production restore/migrations. No live sale is enabled
  by a successful sandbox checkout or this foundation PR.

## Current production checkpoint

### PR #17 answer presentation follow-up

- [x] Implement word-by-word reveal of approved answers, subtle composer and
  preparation feedback, reduced-motion support and an immediate skip control.
- [x] Verify all 12 independent desktop/mobile component browser cases, seven new
  unit cases, all 670 offline tests, eight existing public browser cases,
  lint/types and production build. [Scope and evidence](answer-reveal.md).
- [x] Complete all 12 selected database-backed desktop/mobile browser cases in
  one run, verify TLS/permissions and correct the verifier's obsolete cleanup
  assumptions. All 671 offline tests pass; database permissions were not changed.
- [ ] Verify the final candidate's CI/reviews and production rollout. This
  follow-up makes no paid AI calls and retains the $2 cap.

Detailed scope, sample sizes, limitations and private evidence references are in
[the October 31 verification](production-checks-20261031.md).

- [x] PR #15 merged after exact-head code/security reviews, resolved threads and
  successful Quality CI. Main `e3be579` is Ready on the canonical Vercel domain.
- [x] Apply and verify production migration 0024 on October 30: 25 migration
  receipts, corrected renewal lock ordering and unchanged restricted grants.
- [x] Observe the October 31 scheduled recovery completion at 08:22 IST, before
  manual testing. Vercel's daily job is enabled. A separate authenticated manual
  check returns HTTP 200 and does not update the scheduled marker or alter holds.
- [x] Execute Vercel application rollback to `e6a5e72`, verify a private saved
  answer, then promote `e3be579` back. Canonical routing and cron are restored;
  database migrations, financial counters and 19 runs/83 provider calls persist.
- [x] Complete 50 hosted HTTP probes and six redirect/entry checks. Record two
  unthrottled cached DevTools samples (homepage/workspace LCP 604/952 ms, CLS 0)
  and six completed server runs (median 11.5 seconds, maximum 12.7 seconds).
  These small samples do not certify mobile, field INP, streaming or a load SLO.
- [x] Six real development Neon recovery/concurrency cases pass after correcting
  the v2 test's omitted planner cost; 23 focused offline cases also pass.
- [x] Obtain a clean full Quality result for this follow-up: [run 41174423242](https://github.com/jackedengineer/perplexity/actions/runs/41174423242)
  on `92640af` passed lint/types, all 663 tests, the high/critical audit gate,
  production build and eight browser tests. Both local initialization-timeout
  failures remain recorded; CI does not turn those failed commands into passes.
  Subsequent commits still require their own successful Quality result.
- [x] Reconfirm the non-resetting $1.80 key plus conservative $0.20 retired-key
  allowance: **$2 maximum**, unchanged. This checkpoint makes no AI calls, raises
  no budgets and releases no unknown-cost holds.
- [ ] Complete current quality/human review, hosted operator access, kill-switch,
  current-schema restore/deletion replay, representative performance/field checks
  and the missing homepage favicon. Keep paid-tier activation deferred.

The October 30 hosted smoke separately verified a fresh three-source answer,
progress, reload persistence and zero-credit cancellation after the approved
Tavily 25 -> 50 credit allowance. Those observations do not close quality gates.

## PR #15 review corrections

- [x] Quality CI passed on `1f0ff81`; its code review identified two unresolved
  correctness findings. That result does not approve the subsequent fixes.
- [x] Reproduce the budget lock-order inversion with independent development
  PostgreSQL connections (`40P01`). Migration 0024 replaces the deployed function
  with ascending-ID locks; the owner renewal command uses the same row ordering
  and renewal advisory lock. The same concurrency regression now passes.
- [x] Reproduce both missing fresh-role grants after migrating before creating
  the runtime role. Share the actual provisioning SQL with a restricted-role
  regression; renewal execution and maintenance read/write now pass, while
  budget-ceiling updates and maintenance deletion remain denied.
- [x] Six focused offline checks, the real development concurrency regression,
  lint and types pass. No AI requests, budget changes or production data changes
  were needed for these corrections. Migration 0024 is applied in development.
- [x] Require fresh code/security reviews and CI on the corrected PR head.
- [x] Apply migration 0024 to production through the reviewed owner workflow.

## Safety outage restoration — 29 October

- [x] Reproduce the pinned Mistral EU route's HTTP 429 response with the valid
  replacement key. Preserve failed hosted requests and all unknown-cost holds.
- [x] Fix the privacy-category and defensive-analysis classifications without
  changing corpus labels, turning outages into ALLOW, adding fallback routes or
  retrying inference automatically. Current prompts: input/query v11, evidence
  v6, output v9; safety policy remains v1.
- [x] Complete all 72 semantic cases on Mistral Small 3.2 via `venice/fp8`:
  72/72 dispositions and required categories match, zero unavailable results.
  There were 71 HTTP 200 calls; the other case stopped at the local detector.
  Earlier v9/v10 samples remain failures, not replaced observations. The Qwen
  diagnostic also failed and its candidate routing code was not retained.
- [x] Verify a real local browser answer, progress, four canonical citations,
  source panel and identical answer after reload. Credits changed 32 -> 27 once.
  A separate cancellation saved CANCELLED, charged zero credits and persisted no
  assistant message. Its initial stop response was unconfirmed; checking the
  same request confirmed cancellation. Unknown provider costs remain held.
- [x] Production build, type checks and lint pass after narrowing diagnostic
  fixtures and updating the evaluation manifest's accepted prompt versions.
- [x] Verify all 661 offline cases across batches on the final application code:
  650 passed in the serial run; the telemetry suite's database initialization
  exceeded 30 seconds, and all 11 cases passed in its isolated rerun. This was
  not a single clean full-suite run. Earlier failures remain recorded. Local
  allowances were 15 seconds per test and 30 seconds for initialization;
  production deadlines, assertions and CI settings are unchanged.
- [x] Save the evaluated production safety route and rebuild with the new prompts.
  Production deployment `65DMqLWbX` is Ready and serves `e6a5e72` on
  https://perplexity-gold-alpha.vercel.app. The branch has not been merged.
- [x] Verify hosted research from the separate Google account: photosynthesis
  completed with four cited sources and 40 -> 35 credits; reload retained the
  identical answer. A tides request also completed. Durable accounting records
  each charge once and preserves the unknown Tavily monetary-cost holds.
- [x] Reproduce a hosted early-cancellation race: aborting before admission
  headers arrived allowed the rainbow request to complete and charge normally.
  Keep this failed observation. Fix by waiting for admitted identity, sending
  durable cancellation before disconnecting, and preventing stopped intents
  from being resubmitted by a retry. Flush only owned run identity immediately
  after admission; stage events still require input approval.
- [x] Add four transport regressions and a server metadata-flush regression.
  All 45 related unit checks and six desktop/mobile transport browser checks
  pass. These controlled checks do not substitute for hosted cancellation.
- [x] Deploy the cancellation fix and verify early Stop on the real hosted app:
  run `145ed501-95dc-4dbf-93ef-a4bf9c413520` saved CANCELLED, charged zero
  credits, persisted zero assistant messages and made one provider call. The
  saved-result action retained that state with exactly one run and one call;
  it did not replay inference. Unknown provider cost remains held.
- [x] Read final key metadata at 16:02 UTC: replacement usage $0.034282791,
  remaining $1.765717209, $1.80 non-resetting cap and November 5 expiry.
  Together with the conservative $0.20 retired-key allowance, exposure remains
  bounded by $2. Operator period capacity is $0.45; current daily capacity is
  $0.05 (one reservation). The daily window ends October 30 at 12:15 UTC.
  Existing unknown-cost holds remain reserved; visible account credits are not
  an additional provider allowance.

Ignored evidence: `.artifacts/safety-route/7c6248d0-19b9-4c8e-afab-3bc151221e5c/`,
`.artifacts/p0-restored-local-accounting.json`, `.artifacts/p0-restoration-*`,
`.artifacts/p0-hosted-owner-cancellation-verified.json`,
`.artifacts/p0-final-budget-and-cancellation.json`, `.artifacts/p0-final-*.log`.

## P0.1 — Bounded research availability

- [x] Verify the new $2 non-resetting total allowance. Renew the existing operator
  period without resetting its $0.40 ceiling, settled spend or unknown-cost holds.
  One hosted signed-in Moon answer completed and charged five credits once.
- [x] Create the explicitly approved seven-day replacement key with a $1.80
  non-resetting ceiling. Disable the old key before using its replacement; old
  metadata now returns 401. Conservatively reserve $0.20 for retired-key spend,
  keeping combined exposure <= $2. Replacement expiry: November 5, 17:18 IST.
- [x] Save the replacement only in ignored configuration and Vercel production
  secrets. Extend the existing operator period to its expiry, preserving the
  then-remaining $0.15 capacity and every financial counter. Operator/key limits are
  different controls, not additive allowances.
- [x] Apply the later explicitly approved $1.00 current operator period ceiling.
  Preserve reserved/settled counters, the $0.40 daily ceiling and November 5
  expiry. At approval, period capacity was $0.65. The replacement key remains
  non-resetting at $1.80, plus <=$0.20 retired-key exposure: combined maximum $2.
- [x] Add a restricted daily-window renewal function under an active funded
  period. It cannot create/extend a period, raise ceilings or erase holds.
  Expired/exhausted/unknown namespaces do not receive daily capacity.
- [x] Add a clear paused-research state when app budget capacity is unavailable.
- [x] Complete the stable-main credential redeployment (`HXA3jv5xL`, Ready).
  The valid replacement key did not resolve the pinned provider's 429 outage.
- [x] Repeat hosted answer, source, progress and durable cancellation checks after
  activation. Read-only settlement verification confirms each answer charge once
  and zero credits for the cancelled request. Unknown Tavily/aborted-call costs
  remain held; automatic scheduled reconciliation still needs the P0.2 check.

## P0.2 — Recovery and operator visibility

- [x] Implement `/operations` with a verified-user subject allowlist, empty by
  default. Display budget/key expiry, provider metadata availability, stale runs,
  failure counts and durable maintenance status without credentials or content.
- [x] Add fenced maintenance leases: overlapping sweeps cannot claim a lease;
  superseded work cannot report success. Manual checks cannot certify scheduler
  delivery. Errors or exhausted deadlines fail the sweep.
- [x] Apply migrations 0022/0023 in development and production with restricted
  runtime grants. Owner credentials remain outside the hosted application.
- [x] Exercise local authenticated recovery/reconciliation/retention: HTTP 200,
  no pending work. Browser dashboard shows manual completion while retaining the
  warning for unverified scheduled delivery.
- [ ] Install the production operator allowlist and deploy reviewed code.
- [x] Observe scheduled completion after deployment: October 31 at 02:52 UTC /
  08:22 IST, within the Hobby schedule's one-hour window. See current evidence above.
- [x] Repeat application rollback/restoration and bounded hosted latency smoke.
- [ ] Repeat current kill-switch and latest-schema restore/deletion-replay checks;
  complete representative performance measurements beyond the smoke samples.

The owner selected a private operator dashboard. It requires visiting/refreshing;
it does not send background notifications. Earlier drills keep their limited scope.

## P0.3 — Acceptance evidence

- [x] Separate non-test Google account reaches its own empty workspace and is
  denied the original owner's conversation in the real browser.
- [x] Eight desktop/mobile public browser regressions pass; two additional real
  development-Neon desktop/mobile tests cover renewal, logout and operator denial.
  The production build passes.
- [x] Live catalog smoke passes. Preserve failed corpus samples: initial safety
  had 38 unavailable results; paced Mistral evaluation confirmed 30 HTTP 429s.
  Isolated benign/harmful diagnostics returned HTTP 200 and correct dispositions.
- [x] Final application code: all 661 offline tests verified across batches as
  described above; 390 unit tests also pass together, and 27 public-execution
  integration tests pass together. Build, lint and types pass. The previous
  dependency audit has no high/critical findings; one moderate advisory remains.
- [x] Current semantic safety acceptance: 72/72 match with zero unavailable
  results on the selected provider and current prompts (details above).
- [ ] Complete current planning/answer-quality acceptance. The earlier diagnostic
  observed 3/30 matching routes, 1/5 clarifications and 3/14 paired answers; an
  E2E edit also invalidated its clean-tree assertion. Do not promote that sample
  to acceptance evidence. Azure nano was evaluated separately: 72 observations,
  six unavailable results and twenty decision/category mismatches. It failed
  and was not deployed.
- [ ] Independent safety-label/completion review and ten answers/thirty reviewed
  claims remain required by `evals/README.md`. The Moon answer misleadingly treats
  tidal locking as a cause of phases. Review against [NASA](https://science.nasa.gov/moon/moon-phases/).
  The local ice answer also reports a 10–15% density difference; this quantitative
  claim needs correction/review against [USGS](https://www.usgs.gov/water-science-school/science/water-density).
  Citation validity and a successful research request do not establish factual support.
- [x] Require current code/security reviews and CI before PR #15 merge. Later
  changes require their own checks; this does not approve a subsequent branch.

No paid-tier activation, production fallback expansion, inference retries or
privacy downgrade was added. The accepted historical benign refusal stays recorded.
Ignored evidence: `.artifacts/p0-*`. Raw observations/configuration stay private.

---

# Historical release checks — 23 October 2026 (not current status)

Decision: **HOLD public deployment.** No Vercel project/deployment was created and
no production database content or schema was changed by this verification.
This checklist records evidence; it does not mark unfinished backlog tasks done.
The [current-review corrections](t21-review-fixes.md) supersede the older model
observations below: 13/13 answers and 2/2 no-evidence dispositions pass, but one
semantic check is unavailable and clarification/human review remain pending.
Public guest access and paid tiers are required launch scope.

## Candidate and provider controls

- [x] Fix contradictory safety verdicts without converting malformed output to ALLOW.
  Revision `b101d4f` uses atomic strict classifications; policy remains v1.
- [x] Fix citation formatting without guessing sources or streaming private drafts.
  Structured private paragraphs use only selected source IDs; server-rendered
  markers still pass citation/Markdown, whole-output safety and persistence gates.
- [x] Keep explicit ZDR providers, denied collection, no fallback/tools/plugins,
  no inference retries, bounded tokens, existing deadlines and hard price limits.
- [x] Verify the funded key's $1 total non-resetting cap. At 08:23:14 UTC its total
  usage was $0.02948, leaving $0.97052. Expiry is 29 October at 18:12 UTC.
  Browser balance was $4.97; auto-top-up was inactive. No purchase was made.

## Executed checks

- [x] Lint/types and 526 tests in 55 files; production build passes.
- [x] Frozen complete live rerun: 72/72 semantic decisions match authored labels,
  zero outages, 13/13 expected answers pass citation/output validation, and the
  no-evidence cases pass 1/2 (the other stopped at output safety). No sampled result was replaced by a selected retry.
- [x] Preserve the original failed run and mark the intervening mutable-source run
  diagnostic-only. The final run verifies a clean unchanged tracked revision at
  both start/end; original observations remain ignored locally.
- [x] Browser retest with actual Tavily/OpenRouter: the previously failing MDN
  question completes, four sources render, reload restores the same answer, and
  the console has no warnings/errors. Approved delivery: 32,102 ms, one sample.
- [x] Read-only accounting verification: six provider calls, one settlement,
  1,369 micro-USD known model cost, one search credit and five user credits charged.
  Unknown Tavily USD cost keeps 48,631 micro-USD held rather than guessed away.
- [x] Eight public and eight guarded desktop/mobile browser regressions pass.
  Guarded doubles test no-draft-release, refusal/outage behavior, citations,
  canonical reload and ownership; they are distinct from paid-model observations.
- [x] Eighteen private lab navigation profiles pass unchanged budgets: max LCP
  712 ms, CLS 0, JS transfer 193,719 bytes. Twenty metadata API probes pass.
  Local development-Neon timings do not establish hosted p95 or field INP.
- [x] Production dependency audit: no high/critical advisories; one existing
  moderate esbuild development-server/tooling advisory remains documented.
- [x] All 22 generated static files and tracked files have zero matches for the
  ten configured secret values scanned. No maintenance env file is uploaded.
- [x] Development database verification confirms TLS, 24 tables, RLS and restricted
  runtime grants, including no schema/budget creation or budget-limit escalation.
- [x] Forty restricted-role development-Neon checks in six suites pass: admission,
  input safety, retrieval, completion, recovery and distributed budgets. These use
  synthetic providers and isolated identities, with automatic fixture cleanup.

## Gates still open

- [ ] **Independent evaluation review:** authored safety labels have not received
  independent human review. No human harmful-completion or factual-support rate
  is claimed. At least ten answers/30 reviewed claims and reviewed allowed
  completions are required by the unchanged [evaluation protocol](../evals/README.md).
- [ ] **Required dispositions:** the one clarification case remains ERROR because
  planner T12 is not implemented. Both no-evidence cases pass in the latest rerun.
  One semantic distress check remains UNAVAILABLE; the scorer correctly reports
  PENDING for that observation and independent review.
- [ ] **Current PR review:** the original four findings and five subsequent code
  findings are fixed and their threads resolved. The later checklist inconsistency
  is corrected here. Require code/security approval and CI on the final head;
  old security results are not current approval.
- [ ] **T22 data lifecycle:** owner deletion, active-run fencing on deletion,
  evidence/safety TTL cleanup and private export are not implemented.
- [ ] **T23 operations:** isolated preview/production migration execution,
  CSP, restore drill, application/model rollback, AI kill-switch exercise,
  credential-rotation exercise, log retention/alert destination and hosted reaper
  scheduling still need implementation/configuration and recorded evidence.
- [ ] **Hosted identity/configuration:** reserve/verify the actual Vercel hostname,
  create its matching Google OAuth client, complete the intended audience/branding,
  install only runtime secrets and provision intended user/operator allowances.
  Confirm hosting duration/region constraints; the local 45-second deadline alone
  does not establish hosted compatibility. Production migrations 0007–0008 remain
  pending; owner credentials must never enter runtime settings.
- [ ] **Hosted verification:** secure cookies, OAuth login/logout/revocation,
  cross-user isolation, actual SSE/progress/approved delivery, cron authorization,
  rollback and secret scans on the deployed artifact cannot be marked complete
  from local tests. Use a gated verification environment before public promotion.
- [ ] **Public product scope:** anonymous trials, entitlements/model tiers and
  payments remain T28–T36. Private beta does not imply those features are ready.

The next implementation order remains T12 clarification/planning and the
applicable T22–T24 operational gates, with current code review and independent
evaluation review tracked separately. A protected preview is a verification
environment, not a declaration that the public-launch gate passed.

Detailed measurements and limitations: [live report](openrouter-live-verification.md).
Local-only artifacts: `.artifacts/live-openrouter/third-run/`, repaired-browser
screenshots/accounting, browser regression logs and DevTools profiles. CI retains
only the explicit aggregate evaluation report; raw prompts/evidence/answers and
credentials are not public artifacts.

### Pro UX release candidate — 3 November 2026

- PR #25 closes the containing account/mobile dialog when a plan link is used,
  including navigation to the current billing URL. The regression failed in
  desktop and mobile Chromium before the fix; all 20 motion/model-picker browser
  checks pass afterward. The offline fixture disables the Next development
  indicator so it cannot cover the account control, and accessibility checks
  await the menu's real entrance animation.
- Includes PR #24's deployed billing fixes rather than reverting production.
  Its cancellation race was reproduced with a real adapter and synthetic
  provider responses. Both cancellation and reconciliation retain UNKNOWN
  capacity until an explicit unpaid terminal response or all charged-cycle
  evidence is present. Missing evidence and delayed webhooks cannot free the
  funded seat. Targeted billing validation: 47 tests pass; lint/types pass.
- Fresh code/security reviews and CI must cover the final candidate before
  merge. Cloudflare deployment and live UX acceptance remain pending.
- No payment is made and no synthetic LIVE entitlement is created for UI
  acceptance. The current browser account has no verified active Pro period;
  a real paid-account badge check requires an existing paid account.
- Provider keys, budgets, unknown-cost holds and checkout flags are unchanged.
  Added model routes remain opt-in pending provider acceptance checks.
