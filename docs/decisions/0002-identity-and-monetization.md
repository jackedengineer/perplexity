# ADR-0002: Database sessions and verified credit entitlements

Status: Proposed

Date: 2026-10-22

## Context

The user expanded the project to include anonymous trials, more registered free usage, model selection and paid allowances. The seller is India-based and initial customers are mainly in India. Scale is excluded from the learning objective; production lifecycle correctness remains included.

## Decision

Use Better Auth with Drizzle/Neon database-backed sessions, Google sign-in and anonymous sessions. Set a 7-day rolling validity window, 24-hour renewal eligibility, separately enforced 30-day absolute lifetime and 10-minute sensitive-operation freshness. Disable session cookie caching so protected reads observe revocation from the database. Do not introduce an application access/refresh-token pair for the same-origin web app.

Use Razorpay as the first proposed domestic INR checkout/recurring provider, subject to merchant activation and actual commercial terms. Cashfree is an alternative; Dodo is worth reevaluating for a global Merchant-of-Record requirement. No provider is treated as a way around required verification.

Expose a curated server-entitled model registry. Charge displayed fixed answer-credit bands while separately reserving and reconciling actual monetary provider cost. Sessions do not carry authoritative paid-plan claims. Verified paid periods and unique invoice/payment grants determine entitlement.

## Alternatives and consequences

- Stateless access JWTs reduce some database lookups but add refresh, rotation and revocation machinery without a current independent API/mobile requirement. The existing small Postgres deployment can afford authoritative session checks.
- Raw message counts conceal cost differences between models, retrieval and safety calls. Weighted credits make the difference visible while provider-spend caps remain internal.
- Anonymous users still have server identities; clearing a browser cannot be made equivalent to proving a new human. Abuse controls and the global subsidy cap bound exposure.
- Gateway callbacks and webhook delivery are fallible. Raw signature verification, durable event handling, semantic grant uniqueness and reconciliation are required even at low scale.
- Strict guardrails apply to every tier. Lower-priced models cannot buy a bypass of safety or citation integrity.
- Proposed ₹499/₹999 prices and allowance quantities are experiments requiring actual cost/quality calibration, not established business viability.

## References

[Authentication contract](../authentication.md), [billing and entitlement contract](../billing-and-entitlements.md), [system design](../system-design.md), [implementation backlog](../../tasks/todo.md).
