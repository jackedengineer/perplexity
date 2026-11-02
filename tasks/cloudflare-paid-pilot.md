# Cloudflare production and paid pilot — November 2

The owner authorized production deployment at `perplexity.jacked.dev` and payment
activation after checks. Workers Paid is visibly active, renewing November 30.
PR #23 merged as `42309f5781090c5e62f12e30723906b5aa0853f8` after exact-head
Quality CI and clean code/security reviews. Production DNS has not changed.

The owner explicitly deferred rotation of the previously chat-exposed Razorpay
LIVE secret. Do not print or commit it, or regenerate the shared TEST key.
The owner selected preparation of a **separate $5 AI pilot for one paying customer**;
that selection has not created a key, raised an existing cap or provisioned money.
The existing $2 verification ledger, usage counters and unknown holds remain intact.

## Ordered delivery

- [x] Integrate the reviewed Cloudflare runtime into the staged billing branch,
  preserving both package scripts and release records.
- [x] Explicit LIVE worker configuration pins production origin, Neon runtime
  role/TLS and a LIVE budget namespace. TEST remains development-only.
- [x] LIVE admission requires LIVE paid receipts; failed/stopped attempts keep
  provider exposure without spending completed-report allowance.
- [x] Prepare a one-seat checkout gate: recent actual worker completion, a funded
  35-day minimum delivery window, <=$5 period ceiling and capacity for seven reports
  plus one fully reserved retry each. Uncertain checkouts retain the sole seat.
- [x] Prepare one-cycle LIVE subscription creation. No automatic renewal beyond
  the funded pilot; TEST keeps its historical twelve-cycle setup.
- [x] Independent minute dispatch/recovery and worker-health provenance implemented;
  hosted scheduled delivery remains to be verified.
- [x] Owner-scoped paid-content deletion/export and private checkpoint retention.
  Actual development-Neon browser checks verify export, deletion, ownership and
  late-worker fencing; unknown costs and paid allowance records remain intact.
- [ ] Final offer/UI, full tests/build/OpenNext/browser checks and fresh reviews.
- [ ] Prepare exact $5 key/expiry and runtime credentials for approval; keep
  purchases disabled while installing reviewed production migrations/grants.
- [ ] Hosted sign-in/ownership, fresh guarded research, cancellation/recovery,
  payment receiver/lifecycle and rollback/latency acceptance.
- [ ] Domain OAuth/Turnstile, Razorpay approved-host/webhook checks, DNS cutover
  and final pilot activation after acceptance. Browser Tasks remain unavailable.

## Verification at the production preparation checkpoint

- 809 offline tests, lint/types, Node production build and four public desktop/
  320px offer/policy browser cases pass before the later build-env guard.
- Four desktop/mobile research browser cases pass against the production build:
  two presentation cases use intercepted transport; two use native development
  Neon/API/session/ownership/deletion and synthetic providers. No AI or real charge.
- The initial cold development run had one desktop loading timeout; three other
  cases passed. Its artifacts remain under `.artifacts/deep-browser-first-run/`.
  Production rerun: `.artifacts/paid-pilot-browser-production.log` (four passes).
- OpenNext's env compiler reproduced a local-only packaging leak from `.env.local`
  into `.open-next/cloudflare/next-env.mjs`. That build was never uploaded. The
  new preflight rejects all eight auto-loaded Next env filenames; nine targeted
  regressions pass. The copied development configuration was moved to custom
  ignored `.env.paid-browser.local`; the user's original file remains untouched.
- Credential-free rebuild passes. Scan of 1,808 generated/static files against
  ten configured credential values finds zero matches. The adapter retains its
  existing duplicate-object-key build warnings. Do not claim a warning-free build.

The production Wrangler base contains no secrets, domain route, schedule or
activation switches. Feature switches are installed as persistent Workers Secret
bindings so an ordinary code redeploy cannot reset live financial recovery to an
off default. Missing switches fail closed. Keep reconciliation enabled once real
receipts exist; pause new checkout/inference independently. Final domain binding
and schedule activation remain explicit release steps.

Trust boundaries: cookie identity and server-selected paid environment; signed
provider events plus native payment/invoice verification; durable worker delivery
and fenced leases; fixed-target authenticated cron; independently capped provider
keys and operator reservations. No browser callback grants access, caller-selected
budget/mode, automatic paid retry or fabricated provider receipt is permitted.

## November 2 active release follow-up

The current state supersedes the initial preparation checklist above. Custom-domain
DNS, Google/Turnstile and merchant approval are complete. Ordinary research and
public guest trials pass in the production browser. The explicitly approved
ordinary period ceiling is $1.70; daily $0.40, November 5 expiry and old $2 envelope
are unchanged. The separate $5 non-resetting December-12 pilot key and operator
period exist; the one-hour management credential was revoked. Actual production
minute cron has completed maintenance and demonstrated idle skip.

Paid checkout remains paused while real hosted Deep Research acceptance finishes.
The first isolated run completed retrieval but hit the ordinary 12-second draft
timeout; its unknown cost hold remains. A dedicated bounded 45-second draft window
keeps the same tokens, provider privacy, cancellation and no-retry controls.
A reviewed abuse regression now bounds LIVE billable starts to 14 per paid period,
including failed/stopped work, separately from seven completed report credits.
Deletion preserves the financial rows used to enforce the bound. See the current
release checklist for final verification and outstanding gates.

Final functional evidence: 854 offline tests, lint/types, OpenNext and credential
scan pass. The corrected hosted report completes in approximately 68 seconds,
with 111,034 microUSD settled and zero hold; the earlier failed attempt retains
14,000 microUSD unknown exposure. Browser report replay/copy and a separate hosted
zero-cost running cancellation pass. These are isolated TEST entitlement checks,
not fabricated LIVE receipts or a comprehensive factual-quality evaluation.
