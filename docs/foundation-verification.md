# Foundation verification

Date: 2026-10-22. Scope: Next.js, database connection/migration, Google sign-in and session lifecycle. These results do not certify the unimplemented AI/billing application or a deployed production environment.

## Verified behavior

- Compatible pinned runtime stack: Next 16.4.2, React 19.3.1, Better Auth/Drizzle adapter 1.7.12, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11, pg 8.23.1, Node 24.14.0.
- Strict peer dependency installation; dependency scripts blocked. TypeScript 6.0.3 and ESLint 9.39.5 match the available Next lint plugin peer ranges. Latest TypeScript/ESLint failed peer checks and were not forced into the tree. ESLint 9's support status is a tooling follow-up below.
- Reviewed SQL generated from the version-matched Better Auth schema generator; migration applied successfully to the separate Neon development project.
- Direct and pooled connections report PostgreSQL version `180006`, all five expected auth tables, encrypted TLS transport and an authorized certificate chain. Measured connection plus verification query: approximately 520–580 ms from this machine to Singapore. This includes connection establishment, not just SQL execution.
- Restricted runtime role verified to have auth-table INSERT permission and no CREATE permission in public schema or TRUNCATE permission on sessions. Migration owner is separate.
- Actual Google sign-in completed through the localhost callback; the production-built workspace rendered the owner's identity. No production OAuth publication or billing activation was performed.
- 17 unit/integration tests: environment rejection/redaction, schema foreign keys and unique email, session validity/tampering/expiry/revocation/absolute cap, renewal cookies, trusted-origin enforcement, PKCE/scopes/callback URL, invalid OAuth state and database-backed sign-in limiting.
- Eight browser checks across desktop and mobile: accessible layouts without horizontal overflow, signed-out workspace denial, recoverable OAuth failure and actionable 404. Axe reported zero violations for the selected WCAG A/AA tags on tested pages; this is not a complete manual accessibility audit.
- Two opt-in browser checks against Neon, repeated after switching to the restricted runtime role: authenticated rendering, renewal persisted past six days, sign-out removed the session, and subsequent protected navigation required sign-in. Synthetic identities were removed afterward.
- A separate clean archive of commit `c687d8e`, without `.env.local`, passed frozen/script-disabled installation, lint, strict TypeScript, all 17 isolated tests and production build. Hosted CI still requires a remote repository.

## Frontend performance baseline

Local production build, Chromium, 1280×800 viewport, no network/CPU throttling, fresh browser cache for each of five navigations per route:

| Route | Maximum observed LCP | Maximum observed CLS | Maximum transferred JS |
| --- | --- | --- | --- |
| `/` | 72 ms | 0 | 145,170 bytes |
| `/sign-in` | 72 ms | 0 | 161,905 bytes |

Reproduce with `pnpm perf:check` against a running production build. Budgets are LCP ≤2.5 s, CLS ≤0.1 and transferred JS ≤200 KB on these foundation pages. Results are lab observations; they do not predict deployed performance. INP, mobile throttling, field measurements and AI time-to-first-approved-answer are not measured yet.

A separate ten-request, signed-out `/api/auth/get-session` probe observed server durations of 146–647 ms, including a cold request. This endpoint can involve the Postgres rate limiter even without an authenticated user. Do not present these numbers as authenticated-query latency or as a stable p95 estimate.

During development, a stale in-app preview tab experienced incomplete chunk delivery and repeated Suspense recovery. Restarting the server and opening a fresh preview restored rendering. Independent Chromium tests and the production preview subsequently passed. Avoid dev/build processes sharing a checkout during verification.

## Dependency follow-ups

Audit is not clean. On this date:

| Advisory | Exposure in this project | Disposition |
| --- | --- | --- |
| [esbuild dev-server request disclosure](https://github.com/advisories/GHSA-67mh-4wv8-2f99), moderate | esbuild 0.18.20 through Drizzle Kit's legacy config loader; its vulnerable development server API is not invoked by this application or migration commands | Track upstream loader replacement; do not expose Drizzle Studio or an esbuild development server. No forced transitive upgrade applied. |
| [braces nested-pattern denial of service](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high | Next ESLint plugin → fast-glob → micromatch → braces 3.0.3; lint consumes repository-controlled patterns, not request input; absent from the production dependency audit | No patched release reported by the registry. Monitor upstream and do not accept untrusted glob patterns into lint configuration. |

`pnpm audit --prod --audit-level=high` passes, with the moderate development-loader advisory still reported in the dependency graph. The full audit reports one moderate and one high; neither vulnerable API is reachable from a production HTTP request in this implementation. This is a reachability assessment, not a guarantee that dependencies are risk-free.

Owner: project maintainer. Recheck advisories and ESLint 10-compatible Next/plugin releases by **2026-10-29**, and before public deployment. Keep strict peer checks and CI audit gates enabled. Dependency provenance/signature verification is not claimed by these results.

## Remaining boundaries

The 30-day cutoff is enforced by the application session helper. Better Auth's own session-management response is not an application authorization grant. All future private data/API paths must use the helper and derive ownership on the server.

The configured auth limiter trusts Vercel's IP header. Verify header overwrite behavior and platform request/body limits in the actual deployment. Auth throttling alone is insufficient for anonymous trial or paid AI cost admission.

No conversations, cross-user conversation authorization, guest linking, model pipeline, input/output classification, paid entitlements, deletion/export flow, production CSP, deployment/restore drill or live field monitoring exists yet. Those remain explicit backlog work rather than implied by the working sign-in page.
