# Build backlog

T01–T03 and T05–T11 are implemented. T04 includes signed-in private conversations and owner isolation; deployed-preview verification remains outstanding. T18 recovery and T19 distributed controls are implemented out of order on request, reusing T11 ownership/status boundaries; T12–T17 remain open. T12 intent-preserving planning is next in the original sequence. This is the canonical checklist. Dependencies name earlier task IDs. Each task is intended as a focused, reviewable slice. Generated lockfile/migration metadata and the initial framework scaffold may add mechanical files.

Commands and current verification results are in [README](../README.md) and [the foundation record](../docs/foundation-verification.md). Default integration tests use isolated PGlite PostgreSQL. Opt-in live browser tests use synthetic identities in the dedicated development Neon project, never production.

## Milestone A — foundation and private admission

### T01 — Scaffold and verify the toolchain

- [x] Create a minimal Next.js App Router TypeScript app with one package manager/lockfile; pin compatible stable Next/React/Drizzle/Better Auth versions and a supported Node runtime. Strict peer checks remain enabled. AI SDK/OpenRouter adapter installation moves with its first guarded integration in T08.
- [x] Add strict typecheck, lint, unit-test and build scripts; validate server environment names and keep all secret values out of committed files.
- [x] Verify: frozen install, lint, strict types, isolated DB/auth tests and production build pass; desktop/mobile public and live development-Neon browser checks pass.
- Dependencies: none. Files: generated scaffold, `package.json`, lockfile, `src/server/env.ts`, `.env.example`. This one-time mechanical scaffold is larger than later slices.

### T02 — Define boundary contracts and versioned policy

- [x] Add runtime schemas for submission, plans, evidence, safety verdicts, public stage data and errors; enforce `FAST` only and server-owned model/policy settings.
- [x] Translate the proposed policy into explicit category codes, fixed safe responses and fixtures; defaults contain no permission to bypass unavailable guards.
- [x] Verify: schema tests reject browser role/model/safety overrides, malformed verdicts and oversized fields; policy fixtures distinguish harmful requests from benign near-misses.
- Dependencies: T01. Files: `src/server/contracts/chat.ts`, `src/server/contracts/pipeline.ts`, `src/server/contracts/progress.ts`, `src/server/contracts/errors.ts`, `src/server/safety/policy.ts`, `src/server/safety/responses.ts`, focused contract/policy tests and `tests/fixtures/safety-v1.json`.

T02 verification: [boundary contracts](../docs/boundary-contracts.md). Semantic classification and guard execution are intentionally deferred to T06–T11.

### T03 — Connect Neon and migrate private conversation records

Completed: restricted pooled runtime role, direct migration owner URL, generated auth schema, reviewed/applied migrations and verified TLS. Application UUID profiles, constrained conversations/messages/runs, owner-scoped repositories, replay-safe metadata creation, revision-checked rename, keyset pagination and approved-history filtering are implemented and tested. T05 adds run/reservation/budget constraints and verifies real-database races.

- [x] Configure a small Node `pg` pool with Drizzle, pooled application URL and distinct direct migration URL; define users/conversations/messages/runs with ownership, revisions, sequences and approved-message fields.
- [x] Generate/review migrations and repository methods for creating/loading owner-scoped conversations; reserve JSONB for versioned parts, not ownership/status fields.
- [x] Verify: migrate an empty test database, round-trip a conversation and reject invalid FK/sequence data; prove unapproved assistant rows are excluded by read repositories.
- Dependencies: T02. Files: `src/server/db/client.ts`, `src/server/db/schema.ts`, `src/server/db/conversations.ts`, `drizzle.config.ts`, `tests/integration/conversations.test.ts` plus generated SQL.

### T04 — Implement signed-in ownership across UI and API

Completed sub-slice: Google OAuth, protected workspace, seven-day/24-hour session renewal, 30-day application cutoff, logout/revocation, origin/PKCE/state tests and auth throttling. Application UUID mapping, owner-scoped APIs/UI and desktop/mobile two-user tests are now implemented. Deployed-preview verification remains outstanding.

- [x] Integrate Better Auth's Drizzle adapter and Google sign-in, map its user to the application UUID profile and implement the documented session policy; add create/list/load conversation routes and a minimal signed-in page.
- [x] Derive owner IDs from the session, validate origin on mutations and use the same owner-scoped access helper for every route.
- [ ] Verify: two-user integration/browser cases prove cross-user IDs return safe unavailability; signed-out mutations fail; session protections work in the deployed preview.
- Dependencies: T03. Files: `src/server/auth/session.ts`, `src/server/auth/ownership.ts`, `src/app/api/conversations/route.ts`, `src/app/(app)/search/[conversationId]/page.tsx`, `tests/integration/ownership.test.ts` plus auth-library setup.

Verification evidence: [private conversations](../docs/private-conversations-verification.md) and [admission](../docs/run-admission.md). T04’s combined verification checkbox stays open for a deployed preview.

### T05 — Make run admission idempotent and budgeted

- [x] Add run-key uniqueness, payload HMAC, active-run partial index and usage-bucket/reservation constraints; atomically reserve usage and check conversation revision.
- [x] Define duplicate behavior for running/terminal/mismatched payloads; do not store raw rejected input at admission or replay an unknown paid attempt automatically.
- [x] Verify: concurrent identical requests create one run/reservation; different payload reuse fails; simultaneous quota admissions cannot overspend; stale revision produces a conflict.
- Dependencies: T04. Files: `src/server/db/schema.ts`, `src/server/runs/admit.ts`, `src/server/runs/usage.ts`, `tests/integration/admission.test.ts` plus generated SQL.

### Checkpoint A

- [x] Signed-in conversation creation/reload and cross-user denial work.
- [x] Real-database concurrent admission invariants pass. AI endpoints remain disabled until input and output guards are wired.
- [x] Typecheck, lint, focused integration tests and build pass; update docs if setup choices differ.

## Milestone B — one complete guarded answer

### T06 — Enforce input safety before task work

- [x] Add deterministic checks and an isolated, tool-free `SafetyProvider` using `MODEL_SAFETY` with strict structured verdicts, timeout and policy version; include relevant authorized turn context.
- [x] Store only decision metadata for denial; accepted original messages enter history only after approval. No configured classifier in live mode means safe unavailability, not allow-all.
- [x] Verify: provider spies prove a blocked/timed-out/malformed verdict causes zero planner, Tavily and answer calls; accidental secrets are handled before external forwarding.
- Dependencies: T05. Files: `src/server/ai/models.ts`, `src/server/safety/provider.ts`, `src/server/safety/input.ts`, `src/server/runs/accept-message.ts`, `tests/integration/input-gate.test.ts`.

T06 evidence: [input safety](../docs/input-safety.md). Context must fit six approved current-policy turns/8,000 characters; truncation or stale context is unavailable until T13 revalidation. Transport and continuation ordering use provider test doubles; actual model accuracy, multilingual evaluation and a spending-capped live smoke remain release gates. No public submit endpoint is enabled.

### T07 — Retrieve one bounded evidence package

- [x] Wrap Tavily Search with schema validation, deadline/abort support, explicit limits and generated answers disabled; start with one unambiguous allowed query.
- [x] Add run-source/passage persistence, conservative URL deduplication and baseline evidence inspection through the safety provider; build a bounded evidence package without returning raw source metadata to the client.
- [x] Verify: frozen protocol fixtures handle duplicates, malformed URLs, timeout and zero results; source/passages belong to the admitted run and budget caps cannot be model-overridden.
- Dependencies: T06. Files: `src/server/search/tavily.ts`, `src/server/search/evidence.ts`, `src/server/safety/evidence.ts`, `src/server/db/schema.ts`, `tests/unit/evidence.test.ts` plus generated SQL.

T07 evidence: [bounded retrieval](../docs/retrieval.md). One approved first-question query, fixed basic search, conservative source selection and inspected private persistence are implemented. Frozen fixtures and provider doubles verify transport/lifecycle behavior; live search relevance, classifier accuracy and spending controls remain release gates. No public AI/source endpoint is enabled.

### T08 — Generate private drafts with one answer model

- [x] Add the answer-role prompt and generation adapter accepting original question, selected passages and abort/deadline; use server source IDs and cap output tokens.
- [x] Keep drafts private in bounded memory and disable arbitrary tools/URLs; do not forward provider reasoning fields or raw streams.
- [x] Verify: adapter tests see only selected evidence; no-evidence behavior is explicit; oversize output, provider failure and cancellation cannot produce a public success.
- Dependencies: T07. Files: `src/server/ai/answer.ts`, `src/server/ai/prompts/answer.ts`, `src/server/runs/draft.ts`, `tests/unit/draft.test.ts`.

### T09 — Approve the complete visible response

- [x] Create the sole runtime release gate: source-ID validation, final citation mapping, safe URLs/Markdown, secret checks and semantic output classification; inspect visible source metadata too.
- [x] Produce a frozen approved payload or a fixed safe failure response; clarification and no-evidence responses use the same public release rules.
- [x] Verify: denied, unknown-citation and guard-outage cases yield zero draft bytes or unapproved metadata; a classifier `ALLOW` cannot bypass deterministic release failures.
- Dependencies: T08. Files: `src/server/safety/output.ts`, `src/server/safety/release.ts`, `src/server/ai/citations.ts`, `tests/integration/release-gate.test.ts`.

### T10 — Commit only approved responses

- [x] Implement conditional atomic finalization with approved messages, same-run citation/passages, terminal run state, usage settlement and conversation metadata.
- [x] Record provider attempts and partial/unknown usage without raw content logs; persist a canonical response before any answer delivery.
- [x] Verify: duplicate completion inserts one message; a DB failure releases no answer; FK/run-membership checks reject cross-run citations; settlement is idempotent.
- Dependencies: T09. Files: `src/server/db/schema.ts`, `src/server/runs/finalize.ts`, `src/server/runs/provider-calls.ts`, `tests/integration/finalization.test.ts` plus generated SQL.

T08–T10 evidence: [guarded answers](../docs/guarded-answers.md). Private generation, whole-response approval and atomic completion are implemented; 320 isolated tests, seven restricted-role live completion cases and desktop/mobile approved-history checks cover deterministic behavior. Actual paid model/search quality and the public delivery route remain separate release gates.

### T11 — Deliver the minimal search UI end to end

- [x] Compose admission → input → search → private draft → approval → commit in `/api/chat`; implement the installed AI SDK UI protocol and transport for minimal newest-message submissions.
- [x] Add composer, fixed progress states, approved Markdown/citations, safe refusals and canonical reload; duplicate transport responses load existing status/history.
- [x] Verify: Playwright plus captured response bytes proves one real flow with mocked providers, exact reload, blocked input, blocked output, no raw-draft streaming and sanitized in-band errors.
- Dependencies: T10. Files: `src/server/runs/execute.ts`, `src/app/api/chat/route.ts`, `src/components/chat/chat.tsx`, `src/components/chat/answer.tsx`, `tests/e2e/guarded-search.spec.ts`.

T11 evidence: [public search](../docs/public-search.md). Provider doubles and real development Neon verify transport, guards, settlement and browser behavior. Actual provider quality and a spending-capped live run remain unverified.

### Checkpoint B — first product milestone

- [x] One allowed query retrieves evidence, produces an approved cited answer and survives reload.
- [x] Input denial stops paid task/search calls; output denial exposes no unchecked text through stream/history/status/log capture.
- [ ] Run a small spending-capped live smoke test after configuring actual credentials; record latency, usage and model IDs. This is the first point to demo the product.

## Milestone C — query planning and clarification

### T12 — Add intent-preserving structured planning

- [ ] Implement `CLARIFY | ANSWER` structured planning with original text, bounded server context, source-backed explicit constraints and short search queries; validate plan and outbound query safety.
- [ ] Apply server-controlled fan-out/freshness limits; use original-query fallback only for an unambiguous standalone input after a planner failure.
- [ ] Verify: fixtures preserve negation/entities/budget, reject invented constraints and prohibit unsafe outbound searches; a planner cannot disable guards or raise limits.
- Dependencies: T11. Files: `src/server/ai/plan.ts`, `src/server/ai/prompts/planner.ts`, `src/server/safety/plan.ts`, `src/server/runs/execute.ts`, `tests/unit/planner.test.ts`.

### T13 — Make clarification and follow-ups work in the chat

- [ ] Render a guarded focused clarification with terminal `NEEDS_CLARIFICATION`; answering it starts a new linked run using canonical server context.
- [ ] Load a token-bounded conversation tail; resolve known entities without treating previous assistant prose as current factual evidence or trusting client history.
- [ ] Verify: “its pricing” resolves to the actual discussed product; missing referents ask a question; a clear broad explanation avoids unnecessary clarification; multi-turn safety is re-evaluated.
- Dependencies: T12. Files: `src/server/runs/context.ts`, `src/server/runs/execute.ts`, `src/components/chat/clarification.tsx`, `tests/integration/followups.test.ts`, `tests/e2e/clarification.spec.ts`.

### T14 — Measure whether planning improves the answer flow

- [ ] Create an initial 30-case human-reviewed dataset with direct/general/ambiguous/follow-up/false-premise cases and expected preserved constraints.
- [ ] Compare planner on/off against frozen evidence; report intent preservation, unnecessary clarifications, relevance, added cost and latency; retain failing cases as regressions.
- [ ] Verify: evaluation runs reproducibly with fixtures, emits sample sizes and distinguishes deterministic checks from model-judge opinions; live mode has a strict spending cap.
- Dependencies: T13. Files: `evals/cases/planning.jsonl`, `evals/run.ts`, `evals/score-planning.ts`, `evals/README.md`.

### Checkpoint C

- [ ] No material invented constraints in the curated rewrite suite; original questions remain intact.
- [ ] Clarification ends the current run without search; the next user turn resumes intent through a new run.
- [ ] Keep or tune planner behavior based on measured results, not an assumption that longer prompts are better.

## Milestone D — evidence quality and feedback

### T15 — Add selective extraction and evidence safety

- [ ] Extend the Tavily adapter with bounded Extract for selected URLs and partial-failure handling; apply the existing evidence gate to the newly extracted content before synthesis.
- [ ] Preserve exact excerpts, retrieval/publication timestamps and content hashes; exclude unsafe/unusable material and enforce context-token limits.
- [ ] Verify: injected page text cannot authorize tools, extraction failure produces no invented passages and empty safe evidence produces an approved limited response.
- Dependencies: T14. Files: `src/server/search/tavily.ts`, `src/server/search/extract.ts`, `src/server/safety/evidence.ts`, `src/server/search/evidence.ts`, `tests/integration/evidence-safety.test.ts`.

### T16 — Improve ranking and source transparency

- [ ] Add bounded two-query search, lexical passage relevance, duplicate/syndication handling and explicit freshness/domain preferences; retain meaningful contradictory evidence.
- [ ] Show cited versus additional retrieved sources with approved metadata and an honest citation-support label; do not label ID validation as fact checking.
- [ ] Verify: frozen ranking fixtures and a small labeled retrieval set show the effect of changes; one authoritative source is not discarded solely to meet a diversity heuristic.
- Dependencies: T15. Files: `src/server/search/rank.ts`, `src/server/search/evidence.ts`, `src/components/chat/sources.tsx`, `tests/unit/ranking.test.ts`, `evals/cases/retrieval.jsonl`.

### T17 — Collect owner-scoped feedback

- [ ] Add idempotent feedback upsert and UI controls for helpfulness, missing evidence, wrong interpretation and false refusal; only owned approved messages accept feedback.
- [ ] Use allowlisted reason codes initially, avoiding an unnecessary second untrusted free-text pipeline.
- [ ] Verify: two-user tests reject cross-user feedback; retries update one row; selected state survives reload.
- Dependencies: T16. Files: `src/server/db/schema.ts`, `src/app/api/messages/[id]/feedback/route.ts`, `src/components/chat/feedback.tsx`, `tests/integration/feedback.test.ts` plus generated SQL.

### Checkpoint D

- [ ] Retrieval failures, conflicting sources and unsupported portions are represented honestly.
- [ ] Citations resolve to the exact selected run/source/passages after reload.
- [ ] Source panels expose only approved display data.

## Milestone E — operational readiness

### T18 — Add cancellation, status and stale-run recovery

- [x] Implement owner-scoped cancellation/status routes and cooperative aborts, plus a scheduled authenticated reaper for expired runs and unknown usage reconciliation.
- [x] Use conditional terminal transitions/fencing so late completions cannot override cancellation/timeout; completed answers remain recoverable after delivery loss.
- [x] Verify: concurrent cancellation/completion tests, killed-handler simulation and orphan reservation cleanup; no partial draft appears on status or reload.
- Dependencies: T11 ownership/status reused for this requested out-of-order slice; T12–T17 remain open. Files: `src/server/runs/recover.ts`, `src/server/runs/reconcile.ts`, `src/server/runs/monitor.ts`, `src/app/api/internal/recovery/route.ts`, `src/app/api/runs/[id]/cancellation/route.ts`, `tests/integration/run-recovery.test.ts`, `tests/live/recovery-neon.test.ts`.

T18 evidence: [recovery and reconciliation](../docs/run-recovery.md). Development migration/browser/concurrency checks pass. Production migration, hosted cron activation and paid-provider testing remain pending.


### T19 — Prove distributed usage and deadline controls

- [x] Enforce one absolute deadline and per-stage cost/attempt limits; implement shared per-user and abuse throttles using atomic Postgres counters initially.
- [x] Ensure denial traffic consumes abuse allocation and client disconnect does not reset spending controls; tune under measured load before adding Redis.
- [x] Verify: concurrent quota tests, deadline exhaustion across retries and unknown-cost reconciliation. Show rate/quota/infra/policy outcomes separately.
- Dependencies: T18. Files: `src/server/runs/budgets.ts`, `src/server/runs/usage.ts`, `src/server/runs/rate-limit.ts`, `src/db/rate-limit-schema.ts`, `tests/integration/request-rate-limit.test.ts`, `tests/live/budgets-neon.test.ts` plus generated SQL.

T19 evidence: [distributed controls](../docs/distributed-controls.md). Migration 0008 and restricted grants are verified only in development. Provider testing uses synthetic fixtures; paid verification and production rollout remain pending.

### T20 — Instrument cost, latency and safety decisions

- [x] Add stage spans and operational metrics with request/run IDs, versions, outcome, tokens/credits and estimated/known/unknown cost; raw content logging defaults off.
- [x] Add an authenticated operator view or documented query set for failure rate, p95 stage latency, source failures, safety false-refusal feedback and stuck reservations.
- [x] Verify: a captured trace explains a slow/failing run without containing prompt, draft, secrets or evidence text; cost totals include safety calls and rejected output.
- Dependencies: T19. Files: `src/server/telemetry/trace.ts`, `src/server/telemetry/metrics.ts`, `src/server/runs/execute.ts`, `tests/integration/telemetry.test.ts`, `docs/operations.md`.

Verification: [research operations](../docs/operations.md). False-refusal coverage is explicitly unavailable until T17 feedback/human labeling. JSON tracing and read-only Postgres reports are verified; exporter/retention/alert activation, paid testing and production deployment remain separate gates.

### T21 — Evaluate answer quality and safety coverage

- [x] Expand toward 100+ labeled cases including allowed sensitive/defensive topics, harmful intent, obfuscation, multilingual input, indirect injection and safety-service failure.
- [x] Report supported factual claims, citation coverage, refusal false positives/negatives, model-judge calibration, end-to-end cost and latency with denominators; add critical deterministic guard regressions to CI.
- [ ] Verify: measured baseline and acceptance criteria are recorded; no harmful completion in the finite critical suite; all critical guard/access/retry tests pass without portraying this as universal safety proof.
- Dependencies: T20. Files: `evals/cases/answers.jsonl`, `evals/cases/safety.jsonl`, `evals/score-answers.ts`, `evals/score-safety.ts`, `evals/README.md`.

T21 implementation: [evaluation protocol](../evals/README.md). The 138 safety labels are authored synthetic expectations, not independent human review. The offline runner executes 66 detector/service/output-contract cases and 24 frozen citation cases without provider work. The [first authorized paid sample](../docs/openrouter-live-verification.md) now records all 72 semantic cases and 16 answer cases, but 18 semantic checks were unavailable and independent human labels, completion/support review and judge calibration remain pending. A real browser answer with four citations survives reload; a separate live draft failed citation validation and was withheld. The immutable `b101d4f` rerun fixes those technical failures: 72/72 semantic decisions match expectations with zero outages and 13/13 answer cases pass citation/output validation. The real MDN browser retest also succeeds. The unchanged scorer remains PENDING for independent human review and one missing T12 clarification disposition and one failed no-evidence output check. The [current-review fixes](../docs/t21-review-fixes.md) add category-aware scoring, candidate binding, strict one-block cited paragraphs and a newer complete sample: 13/13 answers and 2/2 no-evidence replies pass, with one unavailable semantic check and human/clarification acceptance still pending. The verification checkbox stays open. T12–T17 remain open, and no public deployment or production database changes were made.

### T22 — Implement conversation deletion and retention

- [ ] Add owner-scoped deletion that fences active runs and removes dependent messages, citations and evidence; define aggregate audit/usage retention without retaining raw content.
- [ ] Implement configured evidence/safety TTL cleanup and private data export; document provider and backup-retention boundaries.
- [ ] Verify: deletion racing with generation cannot resurrect content; deleted evidence cannot be retrieved by ID; TTL expiration keeps citation URLs while honestly removing verification excerpts.
- Dependencies: T21. Files: `src/server/runs/delete-conversation.ts`, `src/server/db/retention.ts`, `src/app/api/conversations/[id]/route.ts`, `tests/integration/deletion.test.ts`, `docs/operations.md`.

### T23 — Prepare CI, preview and production recovery

- [ ] Configure checks, isolated preview database/credentials, single-run reviewed migration execution, compatible rollout and application/model-config rollback; verify provider retention/guardrail assignment on the actual key.
- [ ] Document and exercise AI-request kill switch, credential rotation, restore and reaper scheduling; confirm the hosting deadline/concurrency configuration.
- [ ] Verify: clean preview deploy/migration succeeds; restore drill and rollback have recorded evidence; production secrets never appear in build logs or client bundles.
- Dependencies: T22. Files: `.github/workflows/ci.yml`, `drizzle.config.ts`, `src/server/env.ts`, `docs/operations.md`, `docs/release-checklist.md`.

### T24 — Validate the full launch candidate

- [ ] Add browser accessibility/responsive/error-state coverage and a bounded cold/warm concurrency load test; inspect streamed/history/status data for release-policy bypasses.
- [ ] Verify target budgets on a documented workload and resolve critical failures before public rollout; include package-manager audit/provenance review and safe Markdown/link rendering checks.
- [ ] Verify: typecheck/lint/unit/integration/E2E/build pass, small live quality run meets documented thresholds, and release checklist records evidence and remaining limitations.
- Dependencies: T23. Files: `tests/e2e/launch.spec.ts`, `tests/load/search.ts`, `tests/integration/release-surfaces.test.ts`, `docs/release-checklist.md`.

### Checkpoint E — private beta gate

- [ ] All critical authorization, guard ordering, no-draft-release, quota and concurrency tests pass.
- [ ] Quality/safety/latency/cost targets have measured reports and sample sizes; no claim is based only on happy-path demos.
- [ ] Restore/rollback, usage reconciliation, retention and kill-switch procedures are exercised.
- [ ] Public anonymous/paid launch remains gated on T28–T36, which extend the original scope without renumbering existing tasks.

## Milestone F — optional deep research, after the first release

### T25 — Add durable dispatch with an outbox

- [ ] Select and configure a durable runner/worker; add `RESEARCH` submission only after DB admission/outbox dispatch and authenticated job consumption exist.
- [ ] Add job IDs, checkpoint/lease fencing, bounded retry policy and idempotent dispatch/consume semantics.
- [ ] Verify: crash between admission and dispatch is recoverable; duplicate delivery creates one canonical execution/result; unauthenticated worker calls fail.
- Dependencies: T36. Files: `src/server/db/schema.ts`, `src/server/runs/outbox.ts`, `src/server/runs/dispatch.ts`, `tests/integration/outbox.test.ts` plus generated SQL.

### T26 — Implement bounded evidence-gap research

- [ ] Reuse existing planning/safety/retrieval/generation modules in the worker with an explicit iteration/cost/deadline budget; new queries and evidence batches pass the same gates.
- [ ] Persist neutral progress/checkpoints and expose owner-scoped report status; return `202` rather than pretending the original request remains alive indefinitely.
- [ ] Verify: report completion survives browser close, checkpoint retry does not bypass checks, and iteration/cost limits terminate an unproductive investigation.
- Dependencies: T25. Files: `src/server/research/execute.ts`, `src/server/research/checkpoints.ts`, `src/app/api/research/route.ts`, `src/components/chat/research-status.tsx`, `tests/integration/research.test.ts`.

### T27 — Exercise research failure and cancellation recovery

- [ ] Implement cancellation propagation, stale lease takeover and finalization fencing without automatically replaying provider calls whose billing outcome is unknown.
- [ ] Record the evidence that research improves complex-query quality enough to justify its added latency/cost before enabling it broadly.
- [ ] Verify: worker crashes, duplicate deliveries and cancel/complete races never duplicate approved results or leak drafts; update rollout and operational instructions.
- Dependencies: T26. Files: `src/server/research/recover.ts`, `src/server/research/execute.ts`, `tests/integration/research-recovery.test.ts`, `docs/operations.md`, `evals/README.md`.

## Milestone G — identity and monetization extension

Build these after T24 and before optional T25–T27. Existing task IDs remain stable. The definitive policies are [authentication](../docs/authentication.md) and [billing/entitlements](../docs/billing-and-entitlements.md).

### T28 — Prove session expiry, renewal and revocation

- [ ] Configure Better Auth DB sessions with 7-day rolling validity, 24-hour renewal eligibility, 10-minute sensitive-action freshness and disabled cookie cache; add the separate 30-day absolute cutoff.
- [ ] Ensure route/server-action cookie propagation, account/session revocation and active-run release rechecks; keep Google provider tokens separate from app credentials.
- [ ] Verify: expired/revoked/absolute-expired/freshness cases, correct `Set-Cookie` before SSE, concurrent tabs and no credential material in logs/UI; updating expiry must not be mislabeled token rotation.
- Dependencies: T24, T04. Files: `src/server/auth/config.ts`, `src/server/auth/session.ts`, `src/server/runs/finalize.ts`, `tests/integration/session-lifecycle.test.ts`, `tests/e2e/session.spec.ts`.

### T29 — Add anonymous trial and safe account linking

- [ ] Enable Better Auth anonymous identities and a 30-day quota-only trial handle; enforce 3 Economy answers plus verified bot challenges, trusted-edge abuse controls and a global free-spend ceiling.
- [ ] Implement idempotent guest-to-registered conversation/usage attribution with active-run fencing and safe plugin deletion configuration; do not treat session presence as registered entitlement.
- [ ] Verify: guest reload/expiry, new cookie attempts, shared IP behavior, migration failure/retry and old guest revocation; signup cannot repeatedly mint/reset the monthly free grant.
- Dependencies: T28. Files: `src/server/auth/anonymous.ts`, `src/server/auth/link-guest.ts`, `src/server/db/schema.ts`, `src/server/runs/free-budget.ts`, `tests/integration/guest-linking.test.ts` plus generated SQL.

### T30 — Add entitled model catalog and selector

- [ ] Define server-owned model keys, tested upstream IDs, tier/cost bands, token/search limits and fallbacks; expose only current eligible entries through `/api/models`.
- [ ] Add selector and fixed credit-cost display; validate `modelKey` again on submission and preserve it in admission/idempotency metadata. Internal safety/planner roles remain unselectable.
- [ ] Verify: raw provider IDs, forged tier/price and over-budget fallbacks fail; guest/free/paid selectors reflect current DB entitlements and disabled model states.
- Dependencies: T29. Files: `src/server/ai/catalog.ts`, `src/server/billing/entitlements.ts`, `src/app/api/models/route.ts`, `src/components/chat/model-selector.tsx`, `tests/integration/model-entitlements.test.ts`.

### T31 — Implement answer-credit ledger and usage display

- [ ] Add unique period grants, append-only customer-credit entries, per-run reservations and separate monetary provider-spend accounting; atomically enforce period/daily/concurrency/rate budgets.
- [ ] Implement `/api/usage`, clear reset timestamps and approved-result settlement versus blocked/failed credit release; count unbilled abuse attempts and safety costs against operator budgets.
- [ ] Verify: concurrent reserve/settle races, guest-link attribution, free/paid period boundaries, expired reservations and mixed 2/5/15-credit requests; no double grant/debit or negative admitted balance.
- Dependencies: T30, T05. Files: `src/server/db/schema.ts`, `src/server/billing/credits.ts`, `src/server/runs/admit.ts`, `src/app/api/usage/route.ts`, `tests/integration/credits.test.ts` plus generated SQL.

### T32 — Create Razorpay sandbox checkout intents

- [ ] Configure one test-mode Razorpay adapter with server-owned INR price/plan mapping; registered verified users can create checkout intents with stable keys and current session/origin checks.
- [ ] Use hosted checkout, server verification of signed callbacks and pending confirmation UI; preserve uncertain creation outcomes for reconciliation rather than blindly creating a second subscription.
- [ ] Verify: forged amount/plan/customer, repeated clicks, stale tabs and unknown provider outcomes cannot grant paid access or accidentally create duplicate billable subscriptions.
- Dependencies: T31. Files: `src/server/billing/razorpay.ts`, `src/server/billing/checkouts.ts`, `src/app/api/billing/checkouts/route.ts`, `src/components/billing/checkout.tsx`, `tests/integration/checkout.test.ts`.

### T33 — Apply verified billing events exactly once

- [ ] Add strict raw-byte webhook signature verification, normalized durable inbox events, owner/provider mappings and a unique paid invoice/payment grant path shared with server callback verification.
- [ ] Handle duplicate/out-of-order events, wrong environment/currency/plan, secret rotation and failed event processing without acknowledging and dropping work.
- [ ] Verify: tampered payloads fail, different events for one paid cycle grant once, mandate-only events do not grant paid credits and safe retries preserve billing state.
- Dependencies: T32. Files: `src/server/billing/webhooks.ts`, `src/server/billing/apply-event.ts`, `src/app/api/webhooks/razorpay/route.ts`, `src/server/db/schema.ts`, `tests/integration/billing-events.test.ts` plus generated SQL.

### T34 — Complete subscription lifecycle and reconciliation

- [ ] Implement paid-through access, period credit expiry, failed renewal, next-cycle plan changes, end-of-period cancellation, refund/chargeback adjustments and security suspension.
- [ ] Add owner-scoped billing/status/cancellation routes and a bounded scheduled reconciler for pending intents/inbox events; no browser success URL or stale session claim is entitlement authority.
- [ ] Verify: delayed webhooks, missed renewal, cancellation races, partial refund decisions and provider outages never mint an unearned period or erase already-incurred provider costs.
- Dependencies: T33. Files: `src/server/billing/lifecycle.ts`, `src/server/billing/reconcile.ts`, `src/app/api/billing/route.ts`, `src/app/api/billing/cancellation/route.ts`, `tests/integration/billing-lifecycle.test.ts`.

### T35 — Calibrate pricing and public model budgets

- [ ] Measure actual all-role model/search/extraction costs by preset and stress full 150/350-credit allowance consumption at conservative FX/fees; separate fixed hosting, refunds and free-user subsidy.
- [ ] Enable only models that meet quality/safety and spend envelopes; configure visible free/paid limits and a global ₹1,000/month starting free subsidy cap with a separate daily cap.
- [ ] Verify: a spending-capped live evaluation report justifies the displayed 2/5/15-credit bands and ₹499/₹999 experimental prices; unavailable/over-budget models fail before paid work rather than weakening guards.
- Dependencies: T34. Files: `evals/costs.ts`, `evals/model-candidates.json`, `src/server/billing/plans.ts`, `docs/pricing-validation.md`, `tests/unit/plan-budgets.test.ts`.

### T36 — Release the anonymous, free and paid lifecycle

- [ ] Test guest → registered → checkout pending → paid → renewal/cancellation/downgrade with source-grounded answers and consistent output safety across every tier.
- [ ] Prepare accurate product/support/privacy/terms/refund/pricing pages and complete provider live activation separately; initially expose Free + Starter, with Pro configurable after cost validation.
- [ ] Verify: browser/network, real-DB races, provider sandbox lifecycle, policy/refund/kill-switch and deployment checks pass; no test grant or test webhook can enable live entitlement.
- Dependencies: T35. Files: `tests/e2e/paid-journey.spec.ts`, `tests/integration/billing-environment.test.ts`, `docs/release-checklist.md`, `docs/operations.md` plus required customer-facing policy pages as a separate reviewed content slice.

### Checkpoint G — public trial and paid release gate

- [ ] Session and guest identity boundaries, catalog authorization and credit ledger invariants pass.
- [ ] Merchant activation, recurring payment-method availability and commercial/tax treatment are confirmed for the actual business; all experiments can be demonstrated in sandbox before live approval.
- [ ] Duplicate/out-of-order billing, renewals, refunds, cancellation and unknown outcomes have recovery evidence. No scale infrastructure is added without a measured reason.
