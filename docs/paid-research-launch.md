# Paid Deep Research activation

Status: prepared offer; **LIVE checkout and production Deep Research are not enabled**.
PR #20 merged as `bcfd3ea510644b89c30cd9f480ae45ef8fd91751` after exact-head
code/security reviews, the bot's clean-review confirmation, resolved threads and
successful Quality CI on `3259ac7`.

## Confirmed offer

- Operator: Chirag Bhugra. Public support: trainwithchirag@gmail.com.
- Pro: ₹999 per month, seven completed Deep Research reports per paid month.
  Treat the advertised ₹999 as the final total; do not add unapproved fees.
- Unused runs expire at the verified paid-through date; no rollover.
- No voluntary change-of-mind/unused-allowance refunds. Mandatory legal remedies
  remain available. Do not advertise an absolute waiver of refunds or disputes.
- Cancel renewal at cycle end; preserve already verified paid-through access.
- Browser Tasks are excluded. Failed/cancelled work does not spend a completed-run
  allowance, but incurred provider costs and unknown-cost holds are retained.
- Historical TEST cycles keep their ten-job snapshots. Public offer constants do
  not change existing entitlements or activate purchases.

The owner has not supplied a public business address or support phone. Do not
invent them, copy private KYC details or claim the current Contact draft meets all
applicable merchant disclosure requirements. Confirm final seller disclosures and
tax treatment before enabling purchases.

## Merchant preparation

Local drafts: `/about`, `/contact`, `/pricing`, `/refunds`, with existing `/terms`
and `/privacy`. They identify the upcoming offer and clearly keep purchases off.
These pages have not been submitted as a completed live checkout integration.
Lint, types and production build pass. Four production-build browser cases pass
at 1440px and 320px, checking public navigation, WCAG accessibility, overflow,
the no-purchase state and default-off job/checkout API boundaries. The in-app
browser also verified pricing, refund-policy navigation and operator details.

Razorpay SMS verification succeeded. The Live website application is open with
the correct homepage and the truthful login-required answer. It now requires a
test-account username/password; the app uses Google-only sign-in. Do not supply a
Google password, falsely say login is unnecessary, or add a reviewer bypass.
Arrange a supported Google-login review procedure with Razorpay. Its dashboard
states website verification takes 24–48 hours; Live keys are unavailable until
approval. Leave the shared QuickBus TEST key/webhook untouched.

Official requirements and policy references checked November 1, 2026:

- [Razorpay website approval](https://razorpay.com/docs/payments/dashboard/account-settings/business-website-details):
  website, About, Contact, pricing, terms, privacy and refund details; reviewer
  access and a sample invoice can be requested. Approval precedes Live keys.
- [Razorpay normal refunds](https://razorpay.com/docs/payments/refunds/normal):
  original-method refund handling and estimated 7–10 working-day bank processing.
- [Consumer Affairs e-commerce rules](https://consumeraffairs.nic.in/sites/default/files/E%20commerce%20rules_0.pdf):
  refund/service remedies cannot be replaced by an unconditional no-refund claim.
  Draft pages are business-policy drafts, not a determination of legal compliance.

## Production implementation and activation gates

1. Add an explicit server-selected LIVE billing/job environment. Current code and
   database constraints deliberately accept TEST only and reject Vercel production.
   Never remove those checks without their replacement. Separate TEST/LIVE plan
   identifiers, API credentials, signed webhook secrets and immutable allowance
   versions. Bind period owner **and environment** to the originating checkout.
   TEST receipts must never grant LIVE access or be reinterpreted as seven-run sales.
2. Verify invoice/payment/subscription identity, amount, currency and cycle before
   a seven-run grant; retain reversal tombstones and replay-safe reconciliation.
   Do not let caller-provided mode, price or remaining-count control entitlement.
3. Prepare reviewed production migration/grants for durable jobs (0025–0028 plus
   the LIVE extension); rehearse rollback with admission off and reconciliation
   still available. No production migration was applied during this review fix.
4. Install narrowly scoped production worker credentials only after approval and
   deploy the reviewed engine. Provision an independent maintenance cadence that
   covers the fifteen-minute research deadline. The free Trigger hourly schedule
   is insufficient; no paid upgrade or new scheduler access has been authorized.
5. Test genuine hosted billing lifecycle, owned progress/report/export/Stop,
   terminated-worker recovery, provider outages, usage reconciliation and latency.
   Finish paid-content export/deletion/retention and broader quality evaluation.
6. Preserve the combined **$2 OpenRouter ceiling**, prior spend and uncertain holds.
   The current replacement key expires November 5. A monthly paid service needs an
   explicitly funded delivery window and checkout-capacity policy before accepting
   subscriptions; seven-run access is not additional provider spending permission.
   Do not sell renewals against an expiring verification key or promise continuing
   delivery from this finite test pool. Do not reset a namespace to hide spend.
7. Publish the final reviewed offer/policies, obtain merchant approval, provision
   LIVE credentials/plan/webhook, run acceptance, then enable paid admission and
   checkout together. Access must be payment-gated for every non-operator customer.

Kill switches must stop new purchases/admissions independently of owned reads,
cancellation, webhook ingestion and settlement of already accepted work. Never
disable financial recovery as the way to pause inference.
