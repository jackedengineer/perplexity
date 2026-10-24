# Payments, model access and pricing

> October 24 implementation scope: free-only trials and model/usage controls are
> described in [guest access and credits](guest-access-and-credits.md). Razorpay,
> paid tiers and Premium trials are deferred until the website is hosted. The
> pricing and paid-flow sections below remain proposals, not enabled features.

Status: proposed design revision, 2026-10-22. Seller: India-based. Initial customers: mainly India. Small scale is intentional; billing correctness, security, failure recovery and cost accounting remain in scope. No payment account, subscription, live checkout or charge has been created.

## 1. Provider choice

Recommend **Razorpay** for the first domestic INR integration. Use Cashfree as an alternative if onboarding or required recurring methods fit better. Keep one active provider implementation initially; an adapter is sufficient preparation for another gateway.

| Provider | Useful fit | Onboarding/commercial consideration |
| --- | --- | --- |
| Razorpay | Domestic INR checkout; cards, UPI AutoPay and eMandate subscriptions | Business-type-specific KYC including an individual/unregistered route; merchant/product activation remains subject to review |
| Cashfree | Domestic checkout and recurring card/UPI/eNACH options | KYC and account activation; verify the subscription quote separately from ordinary checkout pricing |
| Dodo Payments | Merchant-of-Record approach for digital products, particularly when selling internationally | Verification/product acceptance still apply; compare India INR, recurring, FX and payout fees rather than the global headline rate alone |
| Stripe | Worth evaluating if an eligible account is already available | Current official support says new Indian accounts are invite-only, so do not make project progress depend on access |

Sources: [Razorpay KYC](https://razorpay.com/docs/payments/business-types-kyc-documents), [Razorpay subscription methods](https://razorpay.com/docs/payments/subscriptions/supported-payment-methods), [Cashfree subscriptions](https://www.cashfree.com/docs/payments/subscription), [Dodo platform](https://dodopayments.com/products), [Stripe India access](https://support.stripe.com/questions/moving-to-invite-only-in-india).

“Godo” likely refers to Dodo Payments. A Merchant of Record can handle parts of customer-transaction tax/billing administration under its contract; it does not remove merchant identity verification or every business/accounting obligation. A gateway integration and merchant onboarding are different workloads. Test mode can be used to build the flow while live activation is pending.

Current pricing references, checked 2026-10-22:

- Razorpay publishes standard 2% plus GST payment-gateway pricing and a conditional introductory offer. Do not base steady-state margins on a promotion; confirm recurring-product charges for the actual account. ([Pricing](https://razorpay.com/pricing/))
- Cashfree's published offer terms state standard 1.95% plus applicable taxes after the eligible promotion ends; method/product differences still need checking. ([Pricing and offer terms](https://www.cashfree.com/payment-gateway-charges/))
- Dodo's published schedule distinguishes India INR domestic pricing from the US headline and lists additional recurring/international/payout conditions. Obtain the relevant quote rather than assuming one universal fee. ([Published fee schedule](https://dodopayments.com/pricing))

For an individual/unregistered Razorpay applicant, the documented path includes identity/address verification and bank details; existing-record retrieval may reduce manual uploads. Required documents depend on the actual business type and verification outcome. Prepare accurate product/pricing, contact/support, privacy, terms and cancellation/refund pages. This is not a guarantee of approval, a required incorporation decision, or a request to upload documents here.

## 2. Pricing unit: answer credits, with transparent costs

Separate three controls:

1. **Request-rate limit:** abuse/burst protection, measured in submissions per minute/day.
2. **Plan allowance:** answer credits available in the current free month or paid billing period.
3. **Internal provider-spend reserve:** money at risk across search, planning, safety, generation and retries.

User-facing credits are application usage units, not raw LLM tokens, cash balances or Tavily credits. Show the fixed credit charge before submission. Keep token counts as internal observability and context/output limits; do not ask a casual user to calculate multiple providers' token prices.

Proposed search presets:

| Preset | Successful sourced answer charge | Starting provider-spend envelope | Retrieval/answer behavior |
| --- | --- | --- | --- |
| Economy | 2 answer credits | Up to $0.02 total variable provider estimate | One basic search, no additional extraction initially, small context, up to 600 answer tokens |
| Standard | 5 answer credits | Up to $0.05 total variable provider estimate | Up to two basic searches and selected extraction when admitted; up to 1,200 answer tokens |
| Premium | 15 answer credits | Up to $0.15 total variable provider estimate | Eligible stronger answer models with bounded context/retrieval; up to 1,800 answer tokens |

These envelopes are conservative **admission policies to calibrate**, not measured bills or a guarantee against an uncertain provider charge. Internally 1 answer credit corresponds to $0.01 of maximum planned provider exposure. Actual charges, known/unknown outcomes, provider price changes and purchase/FX fees must be reconciled separately. If a model/context/search configuration cannot fit the displayed band safely, shrink the configuration with disclosure, offer a higher explicitly priced option, or disable it. Never silently exceed the credit price or skip safety checks to fit it.

Non-search replies can later use a separately displayed lower charge. An approved clarification costs zero answer credits initially, but still consumes request/abuse budgets and the operator's free-spend allocation. Limit repeated clarification attempts; free clarification is not an unlimited classifier endpoint.

## 3. Proposed launch tiers

Prices and allowances are starting experiments, not market-validated demand or an unlimited-use promise. Advertise the configured final tax treatment explicitly at checkout; the financial example below assumes tax-inclusive customer prices only for illustration.

| Tier | Proposed price | Allowance | Model selector | Submission limits |
| --- | --- | --- | --- | --- |
| Guest | Free | 3 Economy answers per anonymous identity, up to 30-day retention | Two evaluated Economy candidates | 1/minute, 3/day, concurrency 1 |
| Registered Free | Free | 40 answer credits/calendar month; at most 5 successful answers/day | Economy and selected Standard models, plus one eligible Premium trial/month | 3/minute, 20 attempts/day, concurrency 1 |
| Starter | ₹499/month | 150 answer credits/paid billing period | Curated Economy, Standard and Premium choices | 10/minute, 50 attempts/day, concurrency 1 |
| Pro | ₹999/month | 350 answer credits/paid billing period | Broader curated set within configured cost bands | 20/minute, 100 attempts/day, concurrency 1 |

Registered Free also has a 20-credit/day ceiling. Its Premium trial costs the same 15 credits from the 40-credit allowance; it is not an extra grant and needs sufficient balance. Do not imply all the examples below can be added together.

If used exclusively for one preset:

- Free: 20 Economy answers OR 8 Standard answers; a Premium trial reduces that remaining balance.
- Starter: 75 Economy OR 30 Standard OR 10 Premium answers.
- Pro: 175 Economy OR 70 Standard OR 23 Premium answers with 5 credits remaining.

Guest usage linked on signup counts toward the current month's registered trial usage instead of being minted again. Registered grants are unique per account/period, not per login/session. Anonymous limits are imperfect because cookies can be cleared; separate abuse controls and the operator budget cap are mandatory.

Free periods reset on a documented Asia/Kolkata calendar month/day boundary initially; store timestamps in UTC and return exact `resetsAt`. Paid allowances follow verified provider billing-period boundaries, not a cron that blindly refills on the first of the month. Credits do not roll over initially. Upgrading replaces the free entitlement with the purchased period grant; it does not stack recurring free refills. Cancellation does not trigger another welcome grant.

For the first live pricing test, expose Free and Starter only. Build Pro as a configuration/testing exercise and enable it when measured costs support it. Avoid annual plans and mid-cycle proration initially; they add refund, mandate and allowance-adjustment cases before monthly billing is proven.

## 4. Models and server authorization

Expose a curated registry, not the entire OpenRouter catalog. A model selector is a server-enforced entitlement boundary, not merely a UI list.

```typescript
type ModelCatalogEntry = {
  key: string; // public application key accepted by /api/chat
  displayName: string;
  providerModelId: string; // exact tested OpenRouter ID; server-owned
  band: 'ECONOMY' | 'STANDARD' | 'PREMIUM';
  allowedTiers: ('GUEST' | 'FREE' | 'STARTER' | 'PRO')[];
  creditsPerSourcedAnswer: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxSearchQueries: number;
  enabled: boolean;
  catalogVersion: string;
};
```

`GET /api/models` derives the current tier and returns enabled eligible entries, costs and trial availability. `/api/chat` accepts `modelKey`, then independently resolves it against the live server catalog and current entitlement. It never accepts an arbitrary upstream ID, price, plan, context window, fallback chain or safety setting. Include the selected key/catalog pricing version in admission and idempotency fingerprints.

Start Economy evaluation with an actual low-cost model such as `google/gemini-2.5-flash-lite`. OpenRouter currently lists $0.10/M input and $0.40/M output tokens for that model. Availability, capability and provider data-policy fit must be checked before enabling it. ([Model listing](https://openrouter.ai/google/gemini-2.5-flash-lite))

Choose a second inexpensive candidate and additional Standard/Premium candidates from the current registry only after a bounded quality/safety/latency evaluation. “DeepSeek” is a family rather than an exact cost/capability. A label such as “GPT Luna” needs an actual verified public provider model mapping; do not invent an API identifier from an app label.

Only the answer model is user-selectable. Planner, safety and verifier roles remain server-controlled and enforce the same minimum quality across tiers. Cheap answers still require the full input/evidence/output gates. Provider fallback stays within the user's authorized cost/capability/policy envelope; a gateway fallback cannot silently select an expensive Premium model for a Guest query.

## 5. Why model token cost alone is insufficient

Tavily currently prices a basic search at 1 API credit, advanced at 2; PAYG credits are $0.008 each. Selective extraction adds its own credit consumption. Account-level free credits are a subsidy to the operator, not a renewable allowance independently available to every app user. ([Tavily credits/pricing](https://docs.tavily.com/documentation/api-credits))

Illustrative Economy run, not an observed benchmark:

```text
Aggregate all model roles: 16,000 input + 1,800 output tokens
Assume every role used the listed $0.10/M input and $0.40/M output rate:
  model cost = 16,000 × 0.10 / 1,000,000
             + 1,800 × 0.40 / 1,000,000 = $0.00232
One basic Tavily PAYG search = $0.008
Illustrative provider subtotal = $0.01032
```

This is a calculation scenario only. A safety model cannot be chosen solely because it matches this price. More searches, stronger classifiers, extraction, retries, reasoning tokens, longer context, gateway purchase fees, FX and hosting increase real cost. Apply actual role-specific prices when estimating a run. Do not rely on repeated OpenRouter `:free` routes as the availability/capacity basis of a production free tier.

Illustrative paid-plan stress budget with ₹90/USD as an **assumed planning exchange rate, not a current quote**, and assumed 18% tax treatment:

| Item | Starter ₹499 | Pro ₹999 |
| --- | --- | --- |
| Assumed tax-exclusive amount, price / 1.18 | ₹422.88 | ₹846.61 |
| Illustrative gateway fee, 2% of gross + 18% tax on fee | ₹11.78 | ₹23.58 |
| Net after those assumed taxes/fees | ₹411.10 | ₹823.03 |
| Full allowance provider-spend envelope | $1.50 = ₹135 | $3.50 = ₹315 |
| Remaining before hosting, refunds, support, gateway purchase/FX fees and free-tier subsidy | ₹276.10 | ₹508.03 |

Use actual merchant tax treatment and provider commercial terms before live pricing. This is a conservative cash-planning example, not a tax determination or net-profit forecast. At low traffic, fixed hosting/monitoring costs may dominate; show them separately from contribution per subscriber.

Proposed initial global free-provider-spend ceiling: ₹1,000/month, with an independently configured daily ceiling and alerts. Convert/reserve against a conservative versioned FX budget before any free run, including declined/failed attempts that might consume safety calls. When the subsidy is exhausted, show a clear retry/paid option before paid work; do not weaken guards. At the assumed ₹90/USD, one free registered account's 40-credit envelope is up to ₹36/month and a guest's 6-credit trial up to ₹5.40, excluding failed-attempt overhead.

## 6. Admission, debit and reconciliation

For every request, check in one short transaction: verified principal/session, tier state/paid-through time, allowed model, rate/attempt counters, concurrency, daily allowance, remaining period credits and internal operator-spend budget. Reserve all relevant limits atomically, then commit before calling external services.

Persist the price/catalog/entitlement version and displayed credit charge with the run. No subsequent model/planner output may raise it. Separate customer credits from actual provider cost:

- Approved delivered-or-recoverable answer: settle the displayed fixed customer credit charge exactly once.
- Clarification, policy block or application/provider failure: release customer answer-credit reservation; still record actual/unknown provider costs and count abuse attempts.
- Unknown provider outcome: hold/reconcile the internal money reserve conservatively; do not automatically replay the generation or mint another customer grant.
- Expiry during a run: use the admitted period snapshot for an otherwise valid bounded run; a security suspension/refund/fraud revocation can fence release.
- A response committed before a lost connection remains charged once and recoverable; a transport retry uses the same run instead of paying again.

Use Postgres constraints and row locks for this small deployment. Add Redis only if measured counter traffic justifies it. Rate limiting in process memory alone is not authoritative when a host can run more than one process.

Use an append-only answer-credit ledger plus unique grants and run reservations. Suggested uniqueness: `(principal, grant_kind, period_key)` for free grants; `(provider, invoice_or_payment_id, grant_kind)` for purchased grants; one customer debit/settlement per run. Record adjustments/reversals rather than overwriting the ledger. Preserve internal cost accounting independently of product credit refunds.

## 7. Payment flow and reliable activation

```mermaid
sequenceDiagram
    participant U as Registered browser
    participant N as Next.js billing API
    participant R as Razorpay checkout/API
    participant P as Neon billing ledger
    U->>N: Select allowlisted priceKey
    N->>P: Persist checkout intent + current account
    N->>R: Create subscription using server plan ID
    N->>P: Save returned provider mapping
    N-->>U: Checkout data / pending status
    U->>R: Authorize and pay through hosted checkout
    R-->>U: Checkout callback
    U->>N: Request status / submit signed callback for verification
    R->>N: Signed webhook with payment/subscription event
    N->>N: Verify raw body signature; normalize event
    N->>P: Persist event + apply idempotent paid grant
    U->>N: Poll billing state
    N-->>U: Confirmed paid entitlement + allowance
```

Create prices/plans on the server. The browser supplies only an allowlisted `priceKey`; it cannot supply amount, currency, provider customer, subscription ownership or tier claims. Checkout requires a registered verified user and current session; protect actions with origin checks and fresh authentication where appropriate.

Checkout callbacks are not paid-plan authority. Validate returned signatures against the server-stored subscription/order context and fetch provider state when needed; normalized verified payment state drives the same idempotent grant path as webhooks. Subscription mandate authorization/creation alone is not evidence that a paid cycle was collected. ([Razorpay integration guide](https://razorpay.com/docs/payments/subscriptions/integration-guide))

Verify webhook HMAC over the exact raw request bytes, validate event schemas, deduplicate and tolerate out-of-order delivery. Event-ID deduplication is only one layer: an immutable paid invoice/payment grant key prevents a second grant even if two different events describe the same charge. Keep webhook-secret rotation compatible with legitimate retries. Return success only after durable acceptance; retry failed processing from the inbox with a bounded reconciliation job. Never acknowledge and discard an unprocessed event. ([Razorpay webhook verification](https://razorpay.com/docs/webhooks/validate-test/))

No provider request is held inside a DB transaction. A timed-out subscription-creation request may have succeeded remotely. Persist `UNKNOWN` on the checkout intent and reconcile before retrying; do not assume every provider API supports the same idempotency semantics. Prevent accidental multiple active subscriptions per customer, including repeated clicks and stale tabs.

## 8. Subscription lifecycle

Map provider states into application states such as `PENDING`, `ACTIVE`, `PAST_DUE`, `CANCEL_AT_PERIOD_END`, `CANCELLED`, `EXPIRED` and `SUSPENDED`. Preserve the raw provider status separately. Entitlements depend on verified paid coverage, not a subscription label alone.

- Successful cycle: grant credits once for its verified period; old recurring credits expire at that period's boundary.
- Renewal failure: do not grant a new paid allowance. Preserve already-paid service through `paidThrough`; afterward use the appropriate Free entitlement. A billing notice grace period does not grant unbudgeted Premium work.
- Cancellation at period end: retain access to the paid-through date, show it explicitly, then downgrade without issuing repeat welcome credits.
- Upgrade/downgrade: initially schedule the new plan for the next cycle, subject to the payment method's supported mandate flow. Do not assume every UPI/card mandate supports in-place updates/proration.
- Refund/chargeback/fraud: update access and record ledger adjustments idempotently. Already-consumed credits are never magically restored as unspent provider money. Prevent new paid work when the account is suspended.
- Webhook delay/outage: show “confirming payment,” reconcile provider state, and never grant from a browser success URL alone.

Keep card/bank/UPI credential collection inside provider checkout. Store provider references, amounts, currency, coverage periods and minimized invoice metadata—not raw card data or merchant KYC documents in the app.

## 9. Database and API additions

Add `model_catalog`, versioned plan/price configuration, `billing_customers`, `checkout_intents`, `subscriptions`, normalized `billing_events`, `credit_grants`, append-only `credit_ledger`, `credit_reservations` and operator-spend budgets. Keep unique provider IDs and ownership FKs. Existing `usage_buckets`/`provider_calls` continue to account for monetary exposure and actual costs; do not overload those amounts with user answer-credit units.

Minimum APIs:

- `GET /api/models`: entitled model keys, fixed costs, trial availability and disabled/unavailable choices.
- `GET /api/usage`: current plan, credits remaining/reserved, daily/rate limits and exact reset timestamps.
- `POST /api/billing/checkouts`: registered verified user + server priceKey + stable request key; returns checkout intent/status.
- `POST /api/billing/verification`: validate callback against server context; never directly trust browser tier/amount.
- `GET /api/billing`: owner-scoped subscription, paid-through, invoice references and pending intent.
- `POST /api/billing/cancellation`: fresh-authenticated, owner-scoped, idempotent scheduling.
- `POST /api/webhooks/razorpay`: provider signature authorization, strict size/raw-body handling; this route alone uses webhook auth rather than user-session CSRF checks.

## 10. Build and release order

First complete the guarded logged-in answer slice. Use Better Auth from the initial identity task. Then add guest sessions/linking, an entitled model catalog and transactional answer-credit accounting. Test checkout and renewal webhooks in Razorpay sandbox before live sales. Enable paid checkout only after duplicate/out-of-order webhook, refund, cancellation, failed renewal and unknown-creation cases are verified.

The concrete extension tasks are T28–T36 in [the backlog](../tasks/todo.md). The current project still contains design documents only. No scale infrastructure is required: one app, one database, trusted provider checkout, and small scheduled reconciliation/cleanup jobs are sufficient for the planned experiment.
