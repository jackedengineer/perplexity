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
