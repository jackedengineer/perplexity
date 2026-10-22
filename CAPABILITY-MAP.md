# Capability map

Status: implementation started, 2026-10-22. Next.js, Neon/Drizzle, Google sign-in, private conversation ownership and T02 boundary contracts/policy are implemented. Runtime safety classification and provider orchestration remain planned. The map below describes the full target; see [the foundation record](docs/foundation-verification.md) for verified current behavior.

| Module | Responsibility | Depends on |
| --- | --- | --- |
| contracts | Versioned request, plan, evidence, safety and response schemas | — |
| persistence | Drizzle schema, Neon connections, repositories, atomic admission/finalization | contracts |
| identity | Better Auth sessions, guest linking and ownership-scoped access | persistence |
| entitlements | Curated model catalog, plan permissions and credit admission | persistence, identity |
| billing | Razorpay checkout, verified events, paid periods and idempotent grants | persistence, identity, entitlements |
| safety | Input, plan, evidence and output policy enforcement | contracts |
| query-planning | Intent-preserving normalization, clarification, bounded search queries | contracts |
| retrieval | Tavily search/extract, passage selection and provenance | contracts |
| answer-generation | Private answer drafting and citation validation | contracts |
| orchestration | Admission, stage ordering, deadlines, usage and release control | persistence, identity, entitlements, safety, query-planning, retrieval, answer-generation |
| chat-experience | Next.js routes and UI, saved conversations, approved responses | orchestration |
| evaluation-ops | Offline quality/safety evaluation, tracing and operational checks | orchestration |

Model and Tavily adapters implement the contracts. Modules do not call each other through HTTP inside the same application. Orchestration composes them without circular dependencies.

Build order: contracts → minimal persistence/Better Auth identity/safety → one complete guarded query-to-answer slice → clarification/follow-ups → retrieval quality → private-beta hardening → guest/model/credit/payment lifecycle → optional durable research. Billing writes entitlement grants; query orchestration reads grants and never calls the payment provider on each question.

Details: [system design](docs/system-design.md), [authentication](docs/authentication.md), [billing and entitlements](docs/billing-and-entitlements.md), [safety policy](docs/safety-policy.md), [implementation plan](tasks/plan.md), [build backlog](tasks/todo.md).
