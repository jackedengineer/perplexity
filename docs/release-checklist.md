# Release checks — 23 October 2026

Decision: **HOLD public deployment.** No Vercel project/deployment was created and
no production database content or schema was changed by this verification.
This checklist records evidence; it does not mark unfinished backlog tasks done.

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
  no-evidence case passes. No sampled result was replaced by a selected retry.
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
- [ ] **Clarification:** two required-disposition fixtures remain ERROR because
  planner T12 is not implemented. The scorer correctly reports PENDING.
- [ ] **Current PR review:** the former four code findings are fixed and their
  threads resolved. Existing reviews predate the latest classifier/draft changes;
  do not treat old review results as current approval. Check CI on the final head.
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
