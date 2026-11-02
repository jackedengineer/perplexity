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
- [ ] Independent minute dispatch/recovery and worker-health provenance.
- [ ] Owner-scoped paid-content deletion/export and private checkpoint retention.
- [ ] Final offer/UI, full tests/build/OpenNext/browser checks and fresh reviews.
- [ ] Prepare exact $5 key/expiry and runtime credentials for approval; keep
  purchases disabled while installing reviewed production migrations/grants.
- [ ] Hosted sign-in/ownership, fresh guarded research, cancellation/recovery,
  payment receiver/lifecycle and rollback/latency acceptance.
- [ ] Domain OAuth/Turnstile, Razorpay approved-host/webhook checks, DNS cutover
  and final pilot activation after acceptance. Browser Tasks remain unavailable.

Trust boundaries: cookie identity and server-selected paid environment; signed
provider events plus native payment/invoice verification; durable worker delivery
and fenced leases; fixed-target authenticated cron; independently capped provider
keys and operator reservations. No browser callback grants access, caller-selected
budget/mode, automatic paid retry or fabricated provider receipt is permitted.
