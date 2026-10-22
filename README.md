# Perplex

A web-research application in progress. The first implemented slice is Next.js, Neon/Drizzle, and Google sign-in through Better Auth. Research, conversations, guest allowances, models and billing remain on the [backlog](tasks/todo.md).

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

Neon URLs use `sslmode=verify-full`. Certificate verification is enabled; do not use `rejectUnauthorized: false`. The runtime pool has a maximum of three connections, a five-second connection timeout and ten-second statement timeout.

The existing development resources are:

- Neon project `perplex-dev`, Free plan, AWS Singapore, Postgres 18, database `perplex`. Its initial branch is named `production` by Neon; this entire project is for development.
- Google Cloud project `Perplex Development` (`gleaming-tube-512408-m1`), OAuth client `Perplex Local Development`.
- OAuth origin `http://localhost:3000`; redirect `http://localhost:3000/api/auth/callback/google`.
- Google audience is **Testing**, with the project owner as a test user. Basic OpenID/profile/email only; no offline Google API access.

For another development database, first migrate with its owner URL. Then run `node scripts/provision-runtime-role.mjs` once to create a restricted runtime role and update the local pooled URL. It grants CRUD on the five auth tables, not schema creation/truncation. It refuses to rotate an existing role. Future migrations must explicitly grant appropriate permissions on new tables. Production provisioning belongs in a separately reviewed deployment workflow.

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

Auth responses have `Cache-Control: no-store`, request IDs and `Server-Timing`. Logs contain event/status/duration, not query strings, cookies, emails or provider tokens. Next.js development logging excludes auth URLs. Server components keep database/auth code out of client bundles; only sign-in/session controls are client islands. Fonts are local system fonts; CSS handles short transitions and honors reduced motion.

## Verification

```sh
pnpm check                  # lint, generated route types, strict TS, 17 tests
pnpm build                  # production build; no credentials needed to build
pnpm exec playwright install chromium
pnpm test:e2e               # 8 public desktop/mobile checks; starts the built app
pnpm test:e2e:neon          # 2 OPT-IN live development DB checks
pnpm db:verify              # read-only TLS/schema verification for both URLs
pnpm perf:check             # production server must already be running
```

Stop `pnpm dev` before browser checks so they exercise the production build. Public tests need no live credentials; CI supplies isolated dummy configuration. Integration tests run migrations and auth against PGlite's isolated PostgreSQL engine. The opt-in Neon browser suite creates synthetic `e2e-*` identities in the configured development database and removes them in `finally`; never point it at production. It does not read a real user's browser cookies or automate Google passwords.

CI installs from the frozen lockfile with dependency scripts disabled, then runs lint/types/tests, production dependency audit, build and browser checks. Actions are pinned to verified commit SHAs. There is no Git remote yet, so hosted CI and branch protection have not been activated.

See [the verification record](docs/foundation-verification.md) for measured results, limitations and dependency-audit follow-ups. The complete app is not ready for public launch: private conversation ownership, AI guardrails, quota admission, deletion/export, CSP/deployment hardening and operational recovery remain planned work.

## Working agreements

Use a feature branch and focused commits. Keep hand-written changes near 300–400 lines or one coherent feature; generated lockfiles/schema snapshots are mechanical exceptions. Run relevant checks before committing and keep `main` reviewable. Do not merge or push without reviewing the final diff. The current work is on `feat/foundation`.

The [system design](docs/system-design.md), [session contract](docs/authentication.md) and [implementation plan](tasks/plan.md) describe the larger product. SDK/OpenRouter/Tavily dependencies will be introduced when their guarded pipeline slices are built.
