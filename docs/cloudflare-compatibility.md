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
