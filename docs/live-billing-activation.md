# Live billing activation — 2 November 2026

Status: **payment integration staged; purchases closed**. This document is not
authorization to increase spending, buy a hosting plan or enable checkout.

## Implemented contract

- ₹999 INR monthly, seven completed Deep Research reports per verified paid cycle.
  TEST keeps `pro-monthly-inr-v1` and ten checks. LIVE uses
  `pro-live-monthly-inr-v1`; changing the public price constant cannot alter grants.
- Credential prefix selects mode on the server. LIVE configuration requires the
  canonical production origin, Vercel production and the pinned Neon runtime role
  and host. Owner credentials and a worker database override are rejected.
- Mode participates in checkout idempotency/open-intent indexes, inbox/reversal
  primary keys, all billing reads/claims and the paid-checkout foreign key.
  A period cannot adopt a TEST checkout or another owner's checkout.
- Signature verification uses exact raw bytes. Native invoice/payment reads must
  prove the amount, currency, references, capture and billing cycle before access.
  Mandate activation and successful browser callbacks alone grant nothing.
- Refund/dispute tombstones remain mode-scoped and prevent delayed regrant.
  Ambiguous creates are saved, not automatically retried. Renewal cancellation
  preserves the independently verified paid-through period.
- Billing reads, cancellation and webhook settlement are independent of job
  admissions. LIVE purchases deliberately remain false in code until production
  fulfillment is implemented and verified. An environment flag cannot bypass this.
- Provider IDs remain globally unique for checkouts/periods, as an additional
  fail-closed check; event and reversal identities are namespaced by mode.

## Provisioning completed

- Razorpay dashboard visibly reports the production website approved.
- The first LIVE key was generated after the owner's approval and SMS handoff.
  A read-only authenticated plans request passed; no prior Live plan existed.
- The prepared monthly plan was created once and read back independently: monthly,
  interval one, INR 99,900 paise. No customer subscription, charge, refund or
  mandate was created. Plan reference and independent webhook secret are ignored.
- API ID/secret are stored in an owner-only ignored local file and Vercel
  **Production Secret** settings. TEST preview settings and QuickBus are unchanged.
- The secret was supplied in chat. Rotate it before activation, update the two
  approved destinations and re-run the read-only check; never commit its value.
  Use `BILLING_ENV_FILE=<ignored file> pnpm billing:verify` for the repeatable
  read-only plan/authentication check. It makes one metadata request, no mutation.
- Migration 0029 applied to development Neon. Production remains through 0024;
  the reviewed paid-job migrations 0025–0029 and restricted grants are pending.

## Evidence

- Offline suite: 765/765 in 108 files; subsequently added migration-upgrade case
  also passes (four schema cases total). No assertion, timeout or gate was weakened.
- Dedicated development Neon: two restricted-role checks pass in 7.25 seconds,
  including concurrent verification, denied allowance escalation, no TEST-worker
  admission from LIVE receipts, cancellation and signed reversal settlement.
  These use synthetic provider responses, not real payments or AI requests.
- Production build, lint and types pass. Four public desktop/320px browser cases
  pass, covering public policy navigation, WCAG checks and default-off API entry.
- Real in-app browser rendered the actual BillingConsole with a disposable local
  fixture: desktop and 320px, paused control, no overflow or captured warnings/errors.
  The fixture route was removed and the final production build excludes it.
- High/critical dependency audit passes. The existing moderate advisory remains.
  No dependency was added. Exact-head CI and external reviews are still required.

## Proposed first paid operating month — not activated

The owner declined the approximately $50 starting envelope and requested cheaper
alternatives on November 2. The original proposal below is retained as a costed
reference, not the selected plan. No service subscription or cap increase is approved.

Start with **at most five paying customers**, not unrestricted public checkout.
The current manifest reserves at most $0.200250 per complete attempt across model
and search steps. Thirty-five completed reports reserve $7.008750; budgeting a
second attempt for each report reserves $14.017500. These are conservative code
ceilings, not measured average costs, a promise of completion or a margin forecast.
Failed/unknown work keeps its real spend/holds; do not retry automatically.

Propose a **$20 production provider ceiling for the first 30-day operating period**,
with $3/day admission ceiling, no auto-top-up and no automatic renewal of spending
permission. Keep the existing $2 verification ledger/key unchanged. This would
authorize up to $22 combined across the existing verification pool and new pilot,
and therefore needs a new explicit approval before provisioning. The provider-key
expiry must cover the last paid-through date plus an operational buffer; the
existing November 5 verification expiry cannot fund a monthly sale.

Reserve delivery capacity for accepted customer periods before selling another
seat. A seat limit alone is insufficient: implement a funding/expiry and worker
health gate, and a renewal-safety process before recurring charges can occur.
Pause new purchases before exhaustion; financial recovery must remain available.
When a future paid cycle cannot be funded, prevent its renewal in advance rather
than collecting and denying delivery. Keep the owner informed about approaching
key expiry, unknown holds and remaining capacity through the operator dashboard.

Service subscriptions are separate from that provider ceiling:

| Item | Proposed monthly allowance | Activation condition |
| --- | ---: | --- |
| Vercel Pro | $20 base for one paid seat | Owner completes commercial-hosting upgrade; verify current checkout/tax and spend controls |
| Trigger Hobby | $10 base | Owner approves upgrade; verify minute schedule and runtime spend controls |
| Provider pilot | $20 hard period ceiling | Explicit new approval, funded balance, bounded key and matching operator limits |
| Tavily | $0 paid usage | Keep PAYG off; propose 500 of the account's 1,000 free credits, only after quota approval |

Planning subtotal: **$50/month before tax, payment processing and any extra usage**.
It is not an all-in enforced invoice cap. No upgrade/purchase/quota increase has
been made. Verify actual dashboard checkout amounts and hard-stop capabilities
before the owner subscribes. Neon remains on its existing free project, subject
to its limits; this is not a guarantee of free capacity.

Primary sources checked November 2:
[Vercel Hobby non-commercial restriction](https://vercel.com/docs/plans/hobby),
[Vercel Pro](https://vercel.com/docs/plans/pro-plan),
[Trigger pricing](https://trigger.dev/pricing),
[free Trigger schedules run no more than hourly](https://trigger.dev/docs/tasks/scheduled#free-plan-minimum-window),
[Tavily pricing/free credits](https://www.tavily.com/pricing).
The six search rounds and one selected-page extraction need a conservative seven
credits per attempt under the current basic-search configuration; 70 attempts
budget up to 490 credits. This quota is currently 50, not 500. Free credits are
shared with ordinary research; reserve them explicitly rather than double counting.

### Lower-cost alternatives requested by the owner

Use a one-customer initial pilot with a **proposed $5 provider period**, rather
than five customers/$20. Fourteen attempts at the current full reservation ceiling
need $2.803500. This leaves a bounded buffer, not permission for unbounded attempts
or guaranteed margin. This is still a proposed increase beyond the existing $2
verification pool; it has not been provisioned. The same funding/expiry, renewal,
paid-content and fulfillment gates apply.

| Option | Indicative monthly base plus $5 provider ceiling | Work and limitation |
| --- | ---: | --- |
| Keep Vercel Pro; Trigger Free; separate Cloudflare Free cron dispatcher | $25 | Smallest hosting change; validate external minute dispatch and Trigger's $5 included runtime credits |
| Netlify Personal; Trigger Free; Cloudflare Free cron | $14 | Node-oriented Next adapter; new hostname/OAuth/Turnstile/webhook and merchant approval changes; validate 60-second streaming and `after()` behavior |
| Cloudflare Workers Paid; Trigger Free; same-platform cron | $10 | Lowest proposed base, but larger runtime migration: validate adapter, PostgreSQL/TLS, Better Auth, approved streaming and background continuation |

These are planning estimates before tax, payment fees, extra usage and optional
domain costs, not enforceable all-in invoice limits or validated deployments.
Keep auto-recharge off and verify actual provider hard-stop controls. A minute
dispatcher must have a fixed maintenance target, no arbitrary task/payload input,
idempotency and bounded CPU/time; it cannot be a publicly triggerable paid-work API.
Cloudflare Free's 10ms CPU limit requires measurement for that tiny dispatcher;
do not move the full Next app to that free runtime on an assumption.

Trigger Free includes $5 monthly runtime credits and stops when exhausted. External
minute dispatch avoids its hosted-cron cadence restriction, but task invocations
and compute still consume those credits. Measure idle maintenance plus actual job
cost before admitting a paying customer; stop selling before recovery funding runs
out. No free hosted-worker capacity is guaranteed by this proposal.

Netlify Free permits commercial projects but its current 300-credit hard limit
pauses the whole team when exhausted. It can be used for a migration proof, not
assumed sufficient for an always-available payment receiver. Personal currently
starts at $9 with 1,000 credits; keep auto-recharge disabled if selected.

Recommendation: keep the $25 option if preserving the approved hostname and launch
speed matter most; evaluate the $10 Cloudflare option if minimum recurring cost is
the priority. Do not start a hosting migration until the owner selects a route.
Neither choice removes the need to implement and verify production job mode and
renewal funding; swapping hosting is not itself paid-feature activation.

Sources checked November 2:
[Netlify commercial Free](https://www.netlify.com/blog/introducing-netlify-free-plan/)
(use only its commercial-use statement; its historical quotas are superseded),
[current Netlify pricing](https://www.netlify.com/pricing/),
[Netlify Next support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/),
[Netlify streaming limit](https://docs.netlify.com/build/functions/api/),
[Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Cloudflare CPU limits](https://developers.cloudflare.com/workers/platform/limits/),
[OpenNext Next.js 16 support](https://opennext.js.org/cloudflare).

## Remaining activation sequence

1. Review/merge the staged payment code with exact-head CI and code/security checks.
   Keep public pages truthful about purchases being closed.
2. Confirm final seller disclosures/tax treatment, rotate the exposed Live secret,
   and obtain approval for the proposed operating month and any service upgrades.
3. Implement/provision a separate production job environment and restricted worker
   credentials. The existing worker guard intentionally supports development only;
   LIVE billing configuration does not override it. Verify automatic dispatch,
   independent minute recovery, lease fencing, cancellation and deadline behavior.
4. Apply production migrations 0025–0029 through the explicit pinned owner workflow
   and restricted grants. Preserve budgets, pending receipts, tombstones and holds.
5. Save the plan/signing secret only in production runtime settings and register
   the signed merchant webhook at `/api/webhooks/razorpay` after its receiver is
   deployed. Request action-time approval for the new webhook credential grant.
   No request-bin service or unsigned delivery path. Keep TEST secrets separate.
6. Finish production paid-content export/deletion/retention, rollback, latency,
   worker-crash recovery, operator alerts and funding/renewal admission checks.
   Test with the isolated TEST setup first; a real charge/mandate/refund requires
   the owner's financial-action handoff, never an agent-made purchase.
7. Enable purchases only after hosted acceptance; activate no unimplemented Tasks.

## Rollback

Do not drop 0029 or relabel LIVE rows as TEST. Pause new purchases and admissions,
leave the mode-aware callback/cancellation/reconciliation paths running, and fix
forward. Once Live receipts exist, rolling back to the old TEST-only billing code
is unsafe. Production has no Live subscription created by this work, so admission
remains off while the reviewed migration and hosted recovery are prepared.
