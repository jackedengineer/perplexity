# Perplex

A web-research application in progress. Next.js, Neon/Drizzle, Google sign-in, private conversations, budgeted admission, input safety, bounded retrieval, guarded answer persistence, and signed-in browser submission/citations are implemented. The current feature branch adds intent planning, contextual follow-ups, guarded clarification, selective extraction, source ranking/transparency and owner feedback. Human quality review, guest allowances and billing remain on the [backlog](tasks/todo.md).

## Run locally

Use Node 24 (see `.node-version`) and pnpm 10.34.5.

```sh
pnpm install --frozen-lockfile --ignore-scripts
cp .env.example .env.local
# Fill the local file; never paste credentials into a PR or chat.
pnpm db:migrate
pnpm dev
```

This workspace already has working development credentials in ignored `.env.local`. Do not overwrite that file when continuing here. Open `http://localhost:3000`.

For a production-build smoke test, stop the dev server first:

```sh
pnpm build
pnpm start --hostname 127.0.0.1
```

Avoid running dev and build simultaneously in the same checkout; Next.js regenerates shared type declarations. HTTP is accepted only for loopback origins. Public origins must use HTTPS; HTTPS enables Secure session cookies.

## Environment and provider setup

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Neon URL for the restricted `perplex_web` runtime role |
| `DATABASE_URL_DIRECT` | Direct owner URL used only by migration/provisioning commands |
| `BETTER_AUTH_URL` | Exact application origin; `http://localhost:3000` for local work |
| `BETTER_AUTH_SECRET` | Random secret of at least 32 characters; keep stable across restarts |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Web OAuth client credentials |
| `RUN_HMAC_ACTIVE_KEY_ID` | Active admission fingerprint key ID, for example `dev-v1` |
| `RUN_HMAC_KEYS_JSON` | JSON object mapping key IDs to independent 32-byte lowercase hex secrets; retain historical keys |
| `RUN_OPERATOR_BUDGET_KEY` | Optional server deployment spend namespace; defaults to `research`, requires privileged bucket provisioning |
| `OPENROUTER_API_KEY` | Server-only answer/classifier API key; no live key or default |
| `MODEL_PLANNER`, `PLANNER_OPENROUTER_PROVIDER` | Explicit private planning role and single upstream provider |
| `MODEL_SAFETY` | Explicit evaluated classifier model ID; never a browser model selection |
| `SAFETY_OPENROUTER_PROVIDER` | Explicit provider slug supporting the model, strict output, privacy and price controls |
| `TAVILY_API_KEY` | Server-only search key; no live search calls or paid activation |
| `MODEL_ANSWER` | Explicit evaluated answer model ID used by the AI SDK adapter |
| `ANSWER_OPENROUTER_PROVIDER` | One explicit answer provider supporting the enforced privacy/price parameters |

Neon URLs use `sslmode=verify-full`. Certificate verification is enabled; do not use `rejectUnauthorized: false`. The runtime pool has a maximum of three connections, a five-second connection timeout and ten-second statement timeout.

The existing development resources are:

- Neon project `perplex-dev`, Free plan, AWS Singapore, Postgres 18, database `perplex`. Its initial branch is named `production` by Neon; this entire project is for development.
- Google Cloud project `Perplex Development` (`gleaming-tube-512408-m1`), OAuth client `Perplex Local Development`.
- OAuth origin `http://localhost:3000`; redirect `http://localhost:3000/api/auth/callback/google`.
- Google audience is **Testing**, with the project owner as a test user. Basic OpenID/profile/email only; no offline Google API access.

For another development database, first migrate with its owner URL. Then run `node scripts/provision-runtime-role.mjs` once to create a restricted runtime role and update the local pooled URL. It grants auth CRUD, profile creation, conversation metadata access, history reads and narrowly scoped admission/reserve writes. Question insertion requires a matching persisted ALLOW review through message RLS. Assistant insertion requires a matching output review and exact approved body hash. Settlement can change reserved/settled balances and insert one receipt. It grants no budget provisioning, limit changes, fingerprint mutation, audit-record mutation or schema creation/truncation. It refuses to rotate an existing role. Future migrations must explicitly grant appropriate permissions on new tables. Production provisioning belongs in a separately reviewed deployment workflow.

In deployment settings, expose only `DATABASE_URL` to the web runtime. Keep the owner URL in the migration job's secret store. Use separate projects, OAuth clients and secrets for preview/production. OAuth-token encryption depends on the auth secret; plan migration/key rotation before replacing it.

## How the foundation connects

```text
Sign-in button → Better Auth browser client
  → same-origin /api/auth/* Node route
  → Google authorization-code flow with PKCE and state verification
  → Better Auth Drizzle adapter → restricted pg pool → Neon
  → HttpOnly, SameSite=Lax cookie → protected server-rendered workspace
```

`src/lib/current-session.ts` is the entry point for protected application reads. It validates the database session, enforces the 30-day absolute cutoff and returns only identity fields. Do not replace it with a cookie-presence check or use raw Better Auth sessions as an application authorization decision.

Sessions have a seven-day rolling window, renew after 24 hours of eligible activity, and configure ten-minute freshness for future sensitive operations. Cookie caching is disabled. The browser refreshes through the cookie-capable auth route; Server Component reads disable renewal. Sign-out revokes the database session. There are no application access/refresh JWTs. Google token material is encrypted at rest by Better Auth and is never rendered in the UI.

Mutation requests require the configured origin. Better Auth also checks OAuth state and callback URLs. Auth rate limits use Postgres: 60 requests/minute by default and 10 sign-in starts/minute per trusted IP. These are abuse controls, not plan quotas or a global spending limit. The configured `x-vercel-forwarded-for` trust boundary is intended for Vercel's overwritten header; other hosts must supply an equivalent verified boundary. Local clients must not be treated as a trusted public edge.

Auth responses have `Cache-Control: no-store`, request IDs and `Server-Timing`. Logs contain event/status/duration, not query strings, cookies, emails or provider tokens. Next.js development logging excludes auth and private conversation URLs. Server components keep database/auth code out of client bundles; interactive controls are client islands. Fonts are local system fonts; CSS handles short transitions and honors reduced motion.

## Private conversations

The protected `/workspace`, `/library`, and `/search/:id` screens share the same database-backed identity. Every repository query scopes by the verified auth subject through an application UUID profile. Foreign and missing conversation IDs return the same unavailable response. Create retries are owner-idempotent, renames require the current revision, lists/history are bounded, and assistant drafts are excluded from history.

The HTTP contract and inspected UI reference coverage are in [private-conversations.md](docs/private-conversations.md). The workspace now accepts questions through `/api/chat`. Original questions remain in memory until input approval; only accepted text may replace the generic “New search” title. The runtime cannot insert unreviewed message drafts. Canonical responses appear after output approval and atomic settlement.

## Research boundary contracts

T02 defines strict submission/planner/evidence/progress schemas, fixed public errors and versioned safety decisions. Unknown or unavailable verdicts fail closed; a 32-case synthetic seed set distinguishes harmful requests from benign near-misses. [Contract details and verification](docs/boundary-contracts.md) explain the seed set and contract boundaries.

T05 adds the internal `admitRequest` service: verified session → bounded JSON body → owner lock and intent check → attempt counters → atomic four-bucket reservation/run/revision update. HMAC retries use the original versioned snapshot and never reserve twice. Customer answer credits and integer micro-USD provider exposure are independent. Budgets must be provisioned by a privileged process; login never creates grants. The [admission contract and evidence](docs/run-admission.md) describe configuration, denial/replay behavior and the remaining settlement/recovery work. HMAC environment settings are validated lazily; missing settings fail closed before public admission.

T06 adds `checkAdmittedInput`: verified session → owned intent/HMAC check → one input-check claim → validated canonical context → local credential/abuse checks → isolated classifier → conditional atomic review/question commit. Denials retain metadata and fixed safe responses. Missing model configuration returns safe unavailability. The [input safety contract](docs/input-safety.md) records strict transport controls, RLS, timeouts, context limits and remaining quality evaluation. Long/stale histories fail closed until safe context selection/revalidation is implemented. T11 connects this gate before retrieval or drafting.

T07 adds `retrieveAdmittedEvidence`: verified session → one canonical approved query → outbound query guard → one bounded Tavily search → evidence inspection → fenced atomic source/passage persistence. `loadPrivateEvidence` authorizes private drafting reads independently of provider configuration. The [retrieval contract](docs/retrieval.md) records limits, retention, cost assumptions and verification. Raw retrieval stays private; T11 releases only the approved cited source registry.

T08–T10 add `completeAdmittedAnswer`: live session → one generation claim → bounded private AI SDK/OpenRouter draft → deterministic citation/Markdown checks → semantic output guard → conditional atomic commit. The transaction persists the canonical response, assistant text, same-run citations, terminal state and idempotent usage receipt together. It returns IDs only after commit; provider reasoning and rejected drafts never enter history. Unknown provider costs retain the remaining monetary hold rather than becoming zero. Current-policy checks also hide stale assistant history.

See [guarded answers](docs/guarded-answers.md) for stage caps, immutable approval, cancellation/fencing, restricted-role verification and recovery limits. Citations establish source membership; factual support remains `NOT_CHECKED`. AI SDK 7 and its matching OpenRouter adapter run only on the server. T11 connects `/api/chat`, fixed progress states, approved Markdown/citations and canonical reload. The browser sends only one newest-question intent through the installed AI SDK transport. Reading saved history defers the active chat SDK, keeping the existing JavaScript budget intact. See [public search verification](docs/public-search.md) for HTTP/recovery behavior, reference comparisons, mobile source dialogs and limits.

## Verification

```sh
pnpm check                  # lint, generated route types, strict TS and tests
pnpm eval:offline           # finite guard/citation checks; aggregate report, no provider calls
pnpm build                  # production build; no credentials needed to build
pnpm exec playwright install chromium
pnpm test:e2e               # 8 public desktop/mobile checks; starts the built app
pnpm test:e2e:neon          # 6 OPT-IN live development DB browser checks
pnpm test:admission:neon    # 7 OPT-IN live development DB races/rollback checks
pnpm test:input:neon        # 6 OPT-IN live DB gate/RLS checks; classifier is a test double
pnpm test:retrieval:neon    # 7 OPT-IN live DB retrieval/ownership/RLS checks; providers mocked
pnpm test:search:neon       # 16 OPT-IN guarded HTTP/UI checks, real Neon, provider test doubles
pnpm test:completion:neon   # 7 OPT-IN live DB completion/RLS/concurrency checks; providers mocked
pnpm db:verify              # read-only TLS/schema verification; 21 tables, narrow grants
pnpm perf:check             # production server must already be running
pnpm perf:profile           # OPT-IN development Neon, desktop/mobile CDP traces and API timings
pnpm perf:check --private   # OPT-IN synthetic identity; 5 samples/private route
```

Stop `pnpm dev` before browser checks so they exercise the production build. Public tests need no live credentials; CI supplies isolated dummy configuration. Integration tests run migrations and auth against PGlite's isolated PostgreSQL engine. The opt-in Neon suites create synthetic identities and isolated budget namespaces in the configured development database and remove them during cleanup; never point them at production. Admission tests use privileged fixture provisioning and the restricted runtime role for all admission operations, with four independently held PostgreSQL backends. No live suite reads a real user's cookies, automates Google passwords or calls paid AI/search providers.

CI installs from the frozen lockfile with dependency scripts disabled, then runs lint/types/tests, production dependency audit, build and browser checks. Actions are pinned to verified commit SHAs. The GitHub remote is `jackedengineer/perplexity`; pull requests trigger the quality workflow. Live Neon tests remain explicitly opt-in and are excluded from default CI. Branch protection and deployed-preview verification remain outstanding.

T21's [evaluation protocol](evals/README.md) separates the 138 authored safety cases
and 24 frozen citation fixtures from human-reviewed model quality. Offline CI
retains only aggregate results for seven days. `pnpm eval:score` imports explicitly
supplied local observations; it cannot call providers. Human/live quality, judge
calibration and paid-provider measurements remain pending.

See [the foundation verification record](docs/foundation-verification.md), [private conversation verification](docs/private-conversations-verification.md), [admission verification](docs/run-admission.md), [input gate verification](docs/input-safety.md), [retrieval verification](docs/retrieval.md) and [guarded answer verification](docs/guarded-answers.md) for evidence and limits. The complete app is not ready for public launch: live provider/model evaluation, production reconciliation/recovery activation, deletion/export and CSP/deployment hardening remain release work.

## Working agreements

Use a feature branch and focused commits. Keep hand-written changes near 400–700 lines or one coherent feature; generated lockfiles/schema snapshots are mechanical exceptions. Run relevant checks before committing and keep `main` reviewable. Do not merge or push without reviewing the final diff. T05–T11, T18–T19 and production configuration preparation are merged into main through PR #8. T18 adds durable cancellation, stale-run recovery and append-only usage reconciliation; see [the recovery contract and operator procedure](docs/run-recovery.md). T19 adds shared submission abuse counters and provider stage deadlines; see [distributed controls and verification](docs/distributed-controls.md). T20 adds private stage traces, usage observations and [operator queries/verification](docs/operations.md). Production migration, hosted telemetry configuration and cron activation remain separate deployment gates.

The [system design](docs/system-design.md), [session contract](docs/authentication.md) and [implementation plan](tasks/plan.md) describe the larger product. T08 uses the Vercel AI SDK for answer generation; T06/T07 retain small fixed-protocol guard/search adapters. Paid provider checks are recorded in [live verification](docs/openrouter-live-verification.md) and the [planning evaluation](docs/query-planning.md); finite samples and human acceptance are tracked separately. Live answers require explicit provider configuration and provisioned development allowances; missing settings fail safely.

The latest [interface/performance/launch review](docs/launch-review.md) records PR review fixes, lab measurements, streaming behavior and the remaining deployment requirements. Public launch remains gated on actual provider evaluation, production OAuth/database configuration and operational release gates.

The [production setup record](docs/production-setup.md) tracks capped OpenRouter/Tavily keys, isolated migrated production Neon, the one-credit live Tavily check, and pending OAuth/deployment. Paid-model testing was later authorized after funding; no Vercel deployment has been created. Production maintenance credentials use ignored `.env.launch.local`, which Next.js does not automatically load.

Planning, clarification and evaluation are documented in [query planning](docs/query-planning.md). New runs use [versioned retrieval budgets](docs/retrieval.md), with inspected extraction, exact ranked excerpts and separately approved cited/additional sources. [Owner feedback](docs/feedback.md) uses enum-only, idempotent versioned updates. Development migrations 0009–0014 are applied; production rollout remains a separate gate.
