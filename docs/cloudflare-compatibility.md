# Free Cloudflare compatibility proof

Authorized November 2, 2026: preserve the $2 combined OpenRouter cap, use free
Cloudflare resources, verify the application in the browser, push focused commits
and open a PR. Intended eventual hostname: `perplexity.jacked.dev` (owner's domain,
registered at GoDaddy). This proof does not change DNS or cut over production.

## Scope and checkpoints

1. Pin OpenNext/Wrangler, build the existing Next.js 16.4.2 app and serve it in
   workerd. Public pages and disabled API boundaries must work before credentials.
2. Adapt database/auth instance lifetime and trusted request metadata where the
   Workers runtime requires it. Keep Neon, Drizzle, transactions, financial locks,
   ownership, session policy and the existing Vercel path intact.
3. Verify repeated and concurrent database-backed requests, sign-in/session,
   private conversation ownership, approved answer rendering, progress/replay and
   cancellation with synthetic providers. Run meaningful browser regressions and
   measure runtime resource use. Simulated streaming is not live AI acceptance.
4. Prepare an isolated free hosted proof only after local checks. Use development
   data/credentials, never the production database or Live payment credentials.
   Any new credential grant receives the required action-time confirmation.
5. Record actual hosted CPU/startup/latency and whether Free is sufficient; open
   the reviewable PR. A passing local emulator is not proof of the Free CPU limit.

## Runtime decisions

- Keep the framework, UI, database, auth, AI SDK/providers and Trigger job engine.
  Use the OpenNext adapter with Node compatibility rather than rewriting routes.
- Configure build/preview manually; do not run a migration command which might
  create R2 resources. No new caching service is required for the initial proof.
- Production remains on Vercel throughout the proof. The proof configuration has
  no custom-domain route, no production trigger/schedule and no Live checkout.
- PR #21 separately stages mode-isolated Live billing and seven-run entitlement
  support. This proof branches from reviewed main; do not merge that unreviewed
  implementation solely to make a hosted demo appear complete.
- Preserve SSR/streaming, private no-store responses and pre-publication safety.
  `after()` acceleration must not replace durable recovery or settlement.
- Never add a public test identity, unsigned maintenance endpoint, fake production
  success or budget bypass to make the proof pass.

## Eventual production gates

The owner wants the complete application live with payments. After compatibility
acceptance, this additionally requires reviewed production job/billing integration,
funded delivery and renewal controls, independent recovery, content lifecycle,
restricted migrations/grants, production secrets, hosted financial acceptance,
the final domain's OAuth/Turnstile configuration and Razorpay website/webhook
approval. The existing finite $2 verification pool is not a monthly operating
budget. Do not enable charges for an unfulfilled monthly research offer.

Keep `perplexity.jacked.dev` reserved as the intended hostname until a safe DNS
change is prepared. Domain registration does not prove DNS is hosted at Cloudflare;
inspect authoritative nameservers and existing records before proposing changes.
Do not move the whole `jacked.dev` zone or alter unrelated records as a shortcut.

## Documentation checked

- [OpenNext existing-app setup](https://opennext.js.org/cloudflare/get-started)
- [Drizzle/Postgres request lifetime](https://opennext.js.org/cloudflare/howtos/db)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

Verification results will be recorded as they complete. No hosted Free, paid
feature, production migration or custom-domain acceptance is claimed at setup.

## November 2 proof results

**Decision: the adapter works locally and the isolated public site works online;
Free production cutover is not accepted.** The first hosted CPU sample is above
Free's 10 ms/request allowance. Do not promote this preview, add production secrets,
attach the production hostname or activate checkout from these results.

- OpenNext 1.20.15 / Wrangler 4.156.1 build Next 16.4.2 successfully. Uploaded
  Worker: 18,094.60 KiB uncompressed / 3,819.76 KiB gzip; startup **19 ms**.
- Isolated [public preview](https://perplex-compatibility-proof.ichiragbhugra.workers.dev/),
  version `8d67bbae-42ff-48bd-929b-3783838f9a14`. Workers Free remained active;
  no R2, Hyperdrive, KV, schedule, paid upgrade or custom-domain binding was added.
  The hosted configuration contains placeholders only: no working database,
  Google app, provider key or payment key. Actual Google sign-in is not enabled.
- **757/757** offline tests, lint, type generation/checking and OpenNext build pass.
  All-dependency audit has no high/critical findings; seven moderate findings remain.
  The new build-tool `glob` CLI advisory is patched through a scoped override.
- **10/10** local workerd public desktop/mobile browser cases pass; **4/4** actual
  development-Neon session/concurrency/ownership/persistence cases pass.
- **4/4** development-Neon delivery browser cases pass: canonical approved answer
  and citation rendering, normal authenticated SSE replay with no additional
  provider calls, saved progress recovery and browser cancellation with one durable
  settlement. Provider results are synthetic fixture data committed through the
  real approval pipeline. This does not test fresh live generation or provider SSE.
- **10/10** hosted public desktop/mobile browser cases pass, including accessibility,
  small viewport, private-entry redirect, mocked OAuth failure UX, actionable 404
  and disabled job/checkout/webhook boundaries. Real Google OAuth and authenticated
  Neon flows on the hosted Worker remain unverified.
- First dashboard CPU sample: **P50 14.871 ms, P90 186.407 ms, P99 258.282 ms**.
  The overview initially showed 15 invocations and zero errors. This is a small,
  mixed-route sample with startup effects, not a capacity benchmark. A lack of
  `exceededCpu` errors during this short check does not prove sustained Free fit.
- Nine separate unauthenticated GET probes measured **24–153 ms** wall time from
  this computer. This is neither authenticated API p95 nor field Web Vitals.
  Private entry/sign-in responses are no-store; public homepage caching is separate.
- The built `.open-next` tree and tracked files contain zero matches for the real
  development DB/auth and proof HMAC credential values scanned. Known synthetic
  placeholders are excluded from the credential scan. Ignored local credentials and private traces were not
  uploaded. No AI request or financial transaction ran; the combined **$2** cap,
  operator/account ceilings and unknown-cost holds are unchanged.

### Reproduced incompatibility and correction

The original global `pg`/Better Auth instances passed an initial session request,
then produced 503 responses after roughly ten seconds on later workerd invocations.
The Cloudflare path now uses request-local instances (`React.cache` only memoizes
inside Server Component requests), with `maxUses: 1`. Existing Node/Vercel singleton
behavior remains the default. Interactive transactions keep one checked-out client;
TLS `verify-full`, advisory/row locks and ownership rules are unchanged.

A separate minimal native-TLS probe reproduced `This socket has been closed.`
**after** `pg` had emitted `remove` for an already finished connection. Only that
exact late cleanup event on an already removed Workers client is ignored. Active
query failures, other pool errors and the existing Node error behavior are retained.
A regression verifies this distinction. The final database browser run has no
`database.pool_error` entries.

Cloudflare deployments trust only the edge-overwritten `CF-Connecting-IP` header
for guest and Better Auth rate limiting. Missing/malformed guest addresses fail
closed; arbitrary forwarded headers are not fallback identities. Guests remain off
in both proof configurations.

### Reproduce safely

For public local checks (no external credentials):

```sh
cp .dev.vars.example .dev.vars
pnpm cf:build
pnpm exec playwright test --config playwright.cloudflare.config.ts
```

`cf:preview` starts local workerd on port 8787. If an explicitly owned server is
already running, `CF_REUSE_SERVER=true` opts into reuse; CI always starts its own.
Each browser configuration uses a separate ignored output directory.

The development-Neon suite additionally requires an ignored, mode-0600
`.env.cf-proof.local` with `LIVE_NEON_ADMISSION=1`, the dedicated development
`DATABASE_URL`, development owner-only `DATABASE_URL_DIRECT`, `BETTER_AUTH_SECRET`,
`RUN_HMAC_ACTIVE_KEY_ID` and `RUN_HMAC_KEYS_JSON`. Supply the same runtime URL,
auth secret and independently generated proof HMAC key in ignored `.dev.vars`.
The owner URL is test-fixture-only; never install it in the Worker. Fixture code
refuses production hostnames and cleans only captured synthetic identities/budgets.
Restart the local server after changing runtime secrets, then run:

```sh
pnpm exec playwright test --config playwright.cloudflare-neon.config.ts
```

The separate public hosted configuration can be regenerated without reading any
local credentials; it does not itself deploy:

```sh
node scripts/prepare-cloudflare-public-proof.mjs
# Explicit manual upload, only to the existing isolated proof Worker:
pnpm exec wrangler deploy --config .artifacts/wrangler-hosted-public.json
CF_HOSTED_PUBLIC_PROOF=1 pnpm exec playwright test --config playwright.cloudflare-hosted.config.ts
```

Do not treat the synthetic auth placeholder as a real secret or replace the dummy
DB URL in that generated file. Real hosted identity/database acceptance is a
separate, restricted configuration step after the CPU gate is addressed.

### Evidence and remaining gates

Local-only artifacts: `cloudflare-public-browser-final.log`,
`cloudflare-database-runtime-final.log`, `cloudflare-delivery-browser-verified.log`,
`cloudflare-hosted-public-browser.log`, `cloudflare-hosted-public-latency.json` and
`cloudflare-hosted-cpu.png`, all under ignored `.artifacts/`. Earlier failed,
interrupted and diagnostic runs are retained separately and do not count as passes.

Before cutover: optimize and retest hosted CPU or obtain separate approval for a
suitable hosting plan; verify real hosted Google/Neon ownership, fresh guarded
research streaming/cancellation/recovery, production worker delivery and financial
acceptance. Complete the separate reviewed billing integration and a sustainable
operating/renewal budget before enabling real charges. The finite $2 test pool
cannot guarantee a month of paid delivery.

DNS inspection confirmed `jacked.dev` already uses Cloudflare nameservers and
`perplexity.jacked.dev` points to an existing Railway destination. The owner
confirmed that destination should be replaced **after checks pass**. No registrar,
zone, subdomain, production OAuth, Turnstile or Razorpay setting changed in this
proof. A zone migration is unnecessary.
