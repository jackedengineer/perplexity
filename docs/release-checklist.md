# Current release checks — 29 October 2026

Decision: **HOLD full release acceptance.** The public site and guest entry are
already deployed. This section supersedes historical status below. The original
record is also retained in [the October 23 checklist](release-checklist-20261023.md).

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
- [ ] Require fresh code/security reviews and CI on the corrected PR head.
- [ ] Apply migration 0024 to production through the reviewed owner workflow.

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
- [ ] Observe a real scheduled invocation after deployment: 02:00 UTC / 07:30 IST.
- [ ] Repeat current kill-switch, restore/rollback and hosted latency checks.

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
- [ ] Require current code/security reviews and CI before merge.

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
