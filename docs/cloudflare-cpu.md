# Cloudflare CPU follow-up — November 2, 2026

Decision: **keep production on its existing deployment**. Two measured changes
reduce CPU without weakening auth, ownership, safety, accounting or cancellation.
They do not establish that the complete application fits Workers Free.

## Changes retained

1. A request with no Cookie header is signed out before loading/constructing the
   Better Auth/database stack. Every cookie-bearing request still uses native
   verification, absolute expiry, reviewer policy and revocation. This is a fast
   denial, never authentication based on cookie presence. No bearer auth plugin is
   configured. Six regressions cover this boundary, including forged/expired cookies.
2. Public build-time output uses the adapter's read-only Workers Assets cache and
   cache interception. The build verifies the prerender manifest **before** running
   `populateCache local`. No R2/KV/Hyperdrive service or database cache is added.
   Private pages and APIs remain uncached/no-store. The manifest guard rejects
   private/runtime pages, positive reviewer forms, dynamic prerenders and time-based
   revalidation; only the existing default-disabled reviewer 404 is permitted.

The same configuration works with the existing Next.js codebase. Node/Vercel
continues to use its current deployment path. No production secrets, domain,
Google client, provider settings, payment settings or database migrations changed.

## Controlled local profiling

Captured workerd V8 CPU profiles through its loopback inspector at a fixed 100 µs
sampling interval. Each warm row uses 20 sequential GETs; cold rows start a fresh
local Worker. Values below are **non-idle sampled time per request**, including
profiler overhead, not Cloudflare's production CPU meter or frontend LCP.

| Experiment | Before → after (ms) | Disposition |
| --- | --- | --- |
| Defer auth when cookies are absent; cold sign-in | 224.372 → 153.198 | Kept; native cookie verification remains covered |
| Public homepage, warm | 29.025 → 5.329 | Kept; immutable build output replaces repeated rendering |
| Privacy page, warm | 30.417 → 3.727 | Kept |
| Terms page, warm | 30.972 → 4.345 | Kept |
| Public homepage, cold | 137.046 → 8.460 | Kept; main Next handler is avoided for this cached route |
| Final Wrangler minification, cold sign-in | 153.198 → 283.553 | Reverted; no reliable warm-page win justified the cold regression |
| Cache configured without population | Warm pages roughly 33–35; cache misses/write warnings | Corrected the build to populate assets; this prototype was not deployed |

A prototype `connection()` placement also turned the default-disabled reviewer
404 into a streamed 200; that page change was reverted. Its HTTP status assertions
are unchanged and pass. No tests were relaxed to make an optimization pass.

A second fresh-Worker profile confirmed warm homepage/privacy/terms samples of
**5.370/4.265/4.170 ms**. Its cold homepage sample was **28.361 ms**, versus the
first optimized 8.460 ms. Cold variation itself is another reason not to infer a
10 ms Free guarantee from the first local sample.

Raw profiles and aggregate samples are local-only under `.artifacts/cpu/`:
`baseline`, `session-fast-denial`, `minified`, `public-before`, `public-after`
(unpopulated prototype), `public-populated` and `public-confirmed`.

## Hosted verification and limitations

The isolated preview is still
[perplex-compatibility-proof.ichiragbhugra.workers.dev](https://perplex-compatibility-proof.ichiragbhugra.workers.dev/).
Optimized version: `2947e21b-111f-4c8d-b377-94523b5b6089`.
Upload size fell from **18,094.60 KiB** to **15,190.17 KiB** uncompressed; startup
was **23 ms** (original 19 ms). No production or provider/payment credentials are
installed. Actual Google OAuth and authenticated Neon on this hosted Worker remain
unconfigured/unverified.

- Lint, types, OpenNext build/population and **771/771 offline tests** pass.
- **12/12 local workerd**, **8/8 development-Neon**, **12/12 hosted public** and
  **10/10 Node production-build** desktop/mobile browser cases pass: 42 total.
- Database cases preserve repeated sessions, concurrent idempotency, ownership,
  persisted citations, approved SSE replay, progress recovery and durable browser
  cancellation with exactly one settlement. Provider inputs remain synthetic.
- New HTTP browser checks retain security headers on cached public pages and
  no-store/unauthenticated boundaries on sign-in, private entry and API surfaces.
- Built output was scanned for the real local database/auth/HMAC credentials:
  zero matches. Private raw profiles/traces are ignored and not uploaded.

Hosted analytics were read through the existing Wrangler credential and Cloudflare's
GraphQL API; no new token grant was created. The schema defines CPU quantiles in
**microseconds**, converted to milliseconds in the probe. Dashboard legends and
mixed time buckets are not used to calculate a before/after improvement percentage.

The controlled probe attempts 60 warm, unauthenticated GETs over six fixed routes,
with identical warmup. The initial baseline and optimized analytics windows have
61/62/58/59 recorded requests rather than exactly 60, so those windows are explicitly
**PENDING**, not accepted comparisons. Observed optimized estimates were around
**3.0–3.3 ms P50 and 14.4–15.8 ms P99**, with zero reported errors. These observations
are consistent with improvement but still show tails above Free's 10 ms allowance.
Adaptive sampling/window attribution and incomplete ingestion must be investigated
before accepting a controlled hosted result. Local gains are not proof of Free fit.

## Bounded reproduction

```sh
pnpm cf:build
pnpm exec playwright test --config playwright.cloudflare.config.ts
# Dedicated development credentials only, as specified in cloudflare-compatibility.md:
pnpm exec playwright test --config playwright.cloudflare-neon.config.ts
# Isolated public hosted checks; no model/payment call:
CF_HOSTED_PUBLIC_PROOF=1 pnpm exec playwright test --config playwright.cloudflare-hosted.config.ts

node scripts/measure-cloudflare-proof.mjs sample candidate
# Read once analytics have ingested the sample; no automatic polling or retries:
node scripts/measure-cloudflare-proof.mjs metrics candidate
```

The probe is fixed to the isolated Worker and six GET routes. It never attaches
cookies, submits an AI question, changes a deployment or calls payments. It saves
its time window and raw aggregate evidence locally, validates complete counts and
finite quantiles, and exits nonzero on incomplete data, errors or P99 over 10 ms.
A passing **public sample** would still not authorize a production cutover.

## Remaining acceptance

Keep the production cutover gate closed. Verify current-head CI/review, complete
hosted CPU attribution and cold/dynamic request tails, then measure real hosted
Google/Neon, guarded fresh research, durable worker/recovery and financial acceptance
in the appropriate isolated environment. Authenticated workloads are not represented
by the cookieless probe. No caches may be extended to private responses to meet the
CPU target. The combined **$2** provider cap, all usage holds and account/operator
limits are unchanged; this follow-up made no paid AI requests or financial transactions.

References checked: [OpenNext performance](https://opennext.js.org/cloudflare/perf),
[read-only SSG cache](https://opennext.js.org/cloudflare/caching#ssg-site),
[Workers CPU profiling](https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/),
[GraphQL metrics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
