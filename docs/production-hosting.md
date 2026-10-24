# Vercel hosting checkpoint — 24 October 2026

The application is hosted at https://perplexity-gold-alpha.vercel.app as a gated
release. This supersedes older statements that no production deployment or
production migration exists. Hosting does not close the public-launch gates in
`tasks/privacy-trials-release.md` or the evaluation protocol.

## Deployed revision and environment

- Production deployment: `EkesrYYUSZQsX6vb1J5pnrzhvBbf`, ready at approximately
  12:42 IST on October 24. Built from `57ee87a122b01d1bd940f3b9ba5c94c9d62cf6b2`
  on `codex/privacy-trials-billing`, promoted through the Vercel browser dashboard
  with a fresh production-environment build. PR #12 remains open; it was not merged.
- Dashboard: https://vercel.com/chiragbhugras-projects/perplexity/EkesrYYUSZQsX6vb1J5pnrzhvBbf
- Existing Git integration still tracks `main` for automatic production deploys.
  Future merges/pushes to `main` can replace this manually promoted revision.
- Next.js preset, Node 24, Fluid Compute, Hobby plan. No paid upgrade selected.
  `vercel.json` overrides the project default with Singapore (`sin1`); deployed
  dynamic HTTP responses independently confirmed Singapore execution.
- Production Neon database: isolated `perplex` database, verified TLS, migrations
  0000–0020 applied. It had zero users/conversations before hosted sign-in testing.
  Runtime uses `perplex_web`; the direct owner URL was never installed in Vercel.
- Verified runtime restrictions: no schema creation, arbitrary budget insertion,
  or credit-ledger insertion; fixed-grant functions and content deletion are
  available under the existing row-security and application ownership controls.

## Production settings

Ten production-only Vercel secrets were configured through the browser:
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `RUN_HMAC_ACTIVE_KEY_ID`, `RUN_HMAC_KEYS_JSON`,
`RUN_OPERATOR_BUDGET_KEY`, `CRON_SECRET`, and `ENABLE_GUEST_TRIALS`.
Secret values are held in ignored local maintenance configuration and Vercel;
none are committed. Preview environments do not receive these secrets.

Google's separately approved `Perplex Production` web client has the exact
callback `https://perplexity-gold-alpha.vercel.app/api/auth/callback/google`.
Only ordinary profile/email sign-in is used. The existing Google project branding
and test-audience/publishing status were not expanded or changed.

Guests are explicitly disabled. Economy catalog entries, Razorpay, paid tiers and
AI-provider credentials are not enabled in production. The workspace therefore
shows **Research unavailable**. The independent operator namespace is
`production-gated`; no production paid-spend allowance was provisioned. The
existing OpenRouter key's non-resetting $1 cap was not changed, and this hosting
verification made no paid inference requests.

## Hosted verification

- Production build succeeded; source revision's GitHub Quality run 40072165964
  passed. Earlier local validation: lint/types/build, 634 offline tests, restricted
  Neon tests and desktop/mobile browser coverage.
- Browser: public landing and sign-in load; Google redirects back successfully;
  authenticated private workspace shows the fixed 40-credit grant. Sign-out
  redirects to sign-in, direct workspace navigation remains blocked afterward,
  and a second Google sign-in succeeds. Guest entry is absent.
- HTTP: landing/sign-in/session endpoints return 200; unauthenticated conversation
  and usage endpoints return 401 with private/no-store headers. Guest creation
  returns 503 while disabled. Recovery without its secret returns 401; the
  authenticated bounded recovery sweep returns 200.
- One-sample HTTP timings were 172–660ms for the observed authentication/private
  endpoints. These are smoke measurements, not hosted p95 or load acceptance.
- Recovery cron remains daily at 02:00 UTC (07:30 IST), as declared in
  `vercel.json`. Direct authenticated sweep was tested; the next scheduled trigger
  has not yet been observed.
- Ignored evidence: `.artifacts/production-db-verified-20261024.json`,
  `production-http-verified-20261024.json`, `production-migrate-20261024.log`,
  `production-workspace-20261024.png` and `production-vercel-20261024.png`.

## Rollback and remaining release gates

Keep AI credentials/guest trials/payment activation disabled if errors arise.
Vercel's project settings also expose Pause Project for an incident that requires
stopping production traffic. The prior production deployment was
`FeEsxRdSL2VzS949FKXCgjPmibia` (main `3ede197`), but lacked the newly configured
environment; do not assume instant rollback to it preserves working auth.
Prefer a fresh deployment of a reviewed prior commit with current production
settings, verify sign-in and private endpoint rejection, and retain additive
schema migrations. Schema restore/rollback has not been exercised.

Still pending: the eight deferred PR #11 findings, independent/current-version
quality evaluation, PR #12 reviews, hosted cross-user/delete/export/guest-link
acceptance, public bot challenge setup, restore/rollback/load drills and alerting.
Razorpay onboarding and test-mode checkout/webhook verification can now use this
hosted URL. Public audience expansion and AI/guest/paid activation remain separate
release work; this checkpoint does not mark them complete.
