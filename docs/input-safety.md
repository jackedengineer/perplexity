# T06 input safety contract

Scope: the internal signed-in FAST path after T05 admission. No public submit endpoint or task/search/answer provider is enabled. T06 branches from T05; its PR depends on the admission PR.

## Boundary and lifecycle

1. Validate the submission again, derive the owner from the verified subject, lock the owned conversation/run and compare the original admission HMAC. Claim `RECEIVED → CHECKING_INPUT` once. A matching retry never starts a second classifier call.
2. Load up to seven canonical turns to enforce a six-turn limit. Validate approval, current policy, text and an 8,000-character aggregate cap. Stale, unapproved, malformed, oversized or truncated context fails closed rather than silently dropping older intent. Longer conversations require the policy-safe context selection/revalidation planned in T13.
3. Check the current question and selected context locally for malformed text, high-confidence secret formats and active protocol-role spoofing. NFKC/format-character normalization is bounded and used only for inspection; accepted user text stays unchanged. No keyword blacklist claims to classify harmful intent.
4. Invoke an isolated tool-free `SafetyProvider`. One configured OpenRouter model/provider, strict JSON output, no fallback/retry, bounded response bytes/output tokens and a five-second timeout capped by the run deadline. Missing configuration and invalid/stale/contradictory verdicts are unavailable. External calls never hold database locks.
5. Recheck ownership, attempt fencing, run status, revision and deadline before committing. Store only fixed decision/category/reason/version/model/timing metadata for denial. An `ALLOW` atomically stores the original approved USER/QUESTION, its review and sequence, then advances to `PLANNING`; denial ends as `BLOCKED` or `FAILED`. No task continuation happens until that commit succeeds.

Reservations remain held on all outcomes until T10 settlement/reconciliation; unknown classifier costs must not be treated as zero. Cancellation/deadline/revision races cannot commit an accepted message. A claimed run is not automatically retried after an unknown provider outcome.

## Trust and privacy

Browser history, role/safety/model overrides and run ownership claims are never accepted. The provider receives only the selected server-owned context and original current question as data, separate from the application policy prompt. Credentials found locally are never forwarded, including credentials embedded in context. A detector can miss unsupported/obfuscated secrets; neither its finite pattern set nor a classifier is a universal guarantee.

The OpenRouter endpoint is fixed HTTPS, redirects fail, response bodies are capped and provider errors are never logged or returned. `MODEL_SAFETY`, `OPENROUTER_API_KEY` and `SAFETY_OPENROUTER_PROVIDER` are server-only configuration with no default model/key. Routing requires the selected provider, supported parameters, no data collection and ZDR. These request controls do not replace vendor/account privacy review or model-quality evaluation before live release.

Database writes must preserve the prior protection against runtime assistant-draft insertion. An append-only input review records one decision per run; runtime question insertion must reference a matching persisted `ALLOW` review. Policy/fixed response contracts remain `v1`. The reviewed response mapping supplies refusal/support/redaction text, never classifier prose.

## Verification plan

- Unit/transport: deterministic secret and benign near-miss cases, Unicode/control data, schema consistency, strict request controls, malformed/oversized/truncated/tool-call output, cancellation and non-cooperative timeouts.
- Isolated Postgres: ownership/HMAC replay, bounded approved context, one classifier call per claim, unchanged accepted text, atomic sequence/review/message/state, rollback and late cancellation/deadline/revision fencing.
- Spies: blocked/unavailable requests cause zero planner, Tavily and answer calls; no rejected content in history, progress, return values or logs.
- Development Neon: restricted-role question acceptance and assistant/unreviewed insertion denial, concurrent claims, cleanup, migrations/TLS/privileges. No live AI calls or paid account activation.
- Full lint/types/tests/build, browser regressions, dependency audit, schema drift and configured-secret scan; focused commits and GitHub push.

Protocol references: [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [chat completion API](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion). Vercel AI SDK remains scheduled with its first answer integration in T08; the small SafetyProvider transport does not introduce another SDK.

## Configuration and state contract

The internal entry point is `src/server/safety/service.ts`. It resolves the database-backed session itself; callers cannot supply an auth subject. The pure `createMessageAcceptance` factory supports database/provider tests. There is no Server Action, HTTP endpoint, browser model setting, production key, default classifier or bypass switch in this slice. The service logs only a random request ID, fixed outcome and elapsed milliseconds. Unexpected driver/provider errors become fixed unavailable results.

Configure all three server settings together in the ignored environment or deployment secret store:

| Setting | Meaning |
| --- | --- |
| `OPENROUTER_API_KEY` | Classifier key, kept separate from HMAC and auth secrets |
| `MODEL_SAFETY` | Explicit evaluated model ID supporting strict structured output |
| `SAFETY_OPENROUTER_PROVIDER` | Explicit compatible provider slug; no provider/model fallback |

The classifier has a 5,000 ms deadline capped by the admitted run deadline, 384 completion tokens, 45,000 serialized outbound bytes, 16,384 response bytes and 2,048 verdict characters. Routing also caps prompt pricing at $0.10/million tokens, completion at $0.40/million and per-request pricing at zero. An unavailable provider at these requirements is a safe outage, never permission to loosen constraints. These controls bound exposure; they do not calculate billed usage or replace the provider ledger/settlement in T10. All original run reservations remain held.

The transport uses one fixed HTTPS endpoint, no redirects, streaming, tools, plugins, reasoning output or retry. Data-collection denial and ZDR are required. The model receives one application system prompt and one JSON user-data payload containing current text and prior turns. It cannot select a model, authorize a tool or provide public refusal prose.

OpenRouter's wire schema uses a strict root object with every property required: decision, categoryCodes, policyVersion and nullable retryable. The adapter checks semantic consistency before translating to the T02 discriminated contract. Contradictory decisions, duplicate/unknown categories, stale versions, extra verdict fields, non-JSON, refusal/tool-call output, multiple choices, truncated completions and oversized bodies fail closed. Provider reasoning fields are discarded.

| Outcome | Persistence and continuation |
| --- | --- |
| Explicit `ALLOW` | Atomically store ALLOW review, exact original question, approved timestamp/policy and next sequence; move to PLANNING; return ACCEPTED only after commit |
| Local or classifier `BLOCK` | Content-free BLOCK review, fixed reviewed response and BLOCKED run; no new question or task continuation |
| Missing/malformed/unavailable classifier | Content-free UNAVAILABLE review and FAILED run; no task continuation |
| Observed cancellation/deadline during checking | No accepted question; safe unavailability and CANCELLED/TIMED_OUT metadata when finalization can commit |
| Changed ownership/revision/attempt during checking | No acceptance commit; conflict/unavailability; leave unknown work held for reconciliation |
| Duplicate input-check claim | Return existing active/terminal status; never start another classifier call |
| Failed acceptance transaction | Roll back review, message and sequence; the prior CHECKING_INPUT claim remains, preventing automatic repeat |

Each short transaction takes the same owner advisory lock and conversation-before-run row-lock order as T05. The provider runs between transactions, with no held connection/lock. The final conditional update checks status, attempt and deadline. Cancellation observed before commit rolls acceptance back. A cancellation arriving after a database commit cannot undo canonical approved history; future task execution must check cancellation/fencing again. A database commit with an unknown client outcome must be recovered by intent/status, not repeated.

`input_safety_reviews` has one append-only row per run, constrained decision/category metadata and a same-conversation USER-message pointer for ALLOW only. The pointer FK is deferred so the review can authorize the question insert in the same transaction. Message RLS requires a matching ALLOW review, approval marker and matching policy. Runtime assistant, draft and unreviewed question inserts fail. Runtime review UPDATE/DELETE, message UPDATE, budget limit changes and settlement remain denied. The shared database role is not per-user RLS: application queries still enforce ownership. The direct owner remains a privileged migration/test credential and bypasses RLS.

## Verification evidence — 2026-10-22

- `pnpm check`: lint, strict types and 147 deterministic unit/integration tests pass. Cases cover schema consistency, secret formats and near-misses, normalization bounds, malformed controls, delayed timeout callbacks, non-cooperative providers/stream cancellation, metadata-only denials, owned original HMAC checks, atomic sequencing, rollback, current-policy context, truncation rejection and late revision/deadline/fencing/cancellation races.
- `pnpm build`: optimized production build passes. The route manifest still has no submit/AI endpoint.
- `pnpm db:migrate` / `pnpm db:verify`: reviewed `0004_input_safety_reviews` applied to development Neon; 14 tables, verified TLS, active message RLS and restricted runtime privileges. RLS state/policies are represented in Drizzle; only FK deferral and grants need reviewed SQL. `pnpm db:generate` reports no schema drift.
- `pnpm test:input:neon`: six tests pass through `perplex_web`, with owner-only synthetic fixture setup. They prove original question/review commit, one classifier across concurrent claims, content-free refusal/unavailability, denied direct assistant/draft/unreviewed inserts, late-fence rejection and pre-classifier credential blocking. Classifier calls are test doubles; no external AI/search call occurs.
- `pnpm test:admission:neon`: all six T05 admission/race regressions pass after the new schema and RLS migration.
- `pnpm test:e2e`: eight public desktop/mobile checks pass. `pnpm test:e2e:neon`: four authenticated desktop/mobile checks pass, including history, owner isolation, session renewal and sign-out.
- `pnpm audit --prod --audit-level=high`: passes, retaining the previously recorded moderate advisory. No dependency was added.
- Configured-credential scan: zero matches in 147 tracked/candidate files and 461 history objects before the final commit. Live fixture cleanup check: zero synthetic admission/input users or operator budgets remain.

The continuation integration harness spies on planner/Tavily/answer boundaries and calls them only after a committed ACCEPTED result. Blocked, malformed, unavailable, timed-out and cancelled runs produce zero calls. This verifies T06 continuation ordering; the real T07–T11 orchestration is not yet implemented. The 32-case labeled seed set remains a contract/evaluation seed, not an accuracy score for an unevaluated live classifier. No false-positive/negative or multilingual-quality claim is made from test doubles.

## Review, rollout and rollback

Review covers auth-before-work, owned payload identity, context provenance, local secret checks before any forwarding, transport/price controls, verdict parsing, lock order, conditional acceptance, RLS, immutable metadata and redacted diagnostics. The context regression was changed from silently dropping stale turns to safe unavailability. A separate regression ensures a delayed timeout callback cannot admit a late ALLOW.

Keep the service internal until retrieval/output gates, provider usage accounting, finalization and public delivery exist. Before live release, evaluate candidate model/provider combinations against labeled benign/harmful pairs, Hindi/multilingual and multi-turn cases, verify actual account privacy/spending controls and record bounded live costs/latency. T11/Checkpoint B schedules that spending-capped smoke test. Do not activate an arbitrary model merely to make a demo respond.

Rollback application code while retaining review records, RLS and held reservations. T05 metadata/history reads remain compatible. Do not disable RLS, delete safety metadata or zero budget counters as a rollback shortcut. Stalled/unknown checking states require the fenced settlement/reconciliation lifecycle planned in T10/T18–T19. No production deployment is certified here.
