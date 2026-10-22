# ADR-0001: Use a bounded pipeline with approval before response release

Status: Proposed

Date: 2026-10-22

## Context

The requested application combines Next.js, AI SDK, OpenRouter, Tavily, Neon and Drizzle. It must clarify ambiguous questions, produce sourced answers and enforce server-side input/output guardrails. The workspace is initially empty; a small team must be able to implement and operate the design.

## Decision

Use one modular Next.js application with a code-controlled request pipeline. Planning emits a validated interpretation and bounded queries; it does not authorize arbitrary tools. Keep original user text separate from model-written search plans. Use one answer model initially and evaluate model selection offline.

Generate complete drafts privately, validate the final visible payload, persist only approved answers, then release them. Stream only neutral status before approval. Apply the same release predicate to clarification, history, citations, titles and later exports.

Use Node.js routes with Drizzle over a transactional Postgres driver (`pg`) and Neon's pooled application connection. Run migrations separately through the direct connection. Store atomic idempotency, ownership, run state and usage reservations in Postgres.

Implement synchronous bounded fast mode first. Deep research requires a durable runner and worker, which are a later extension.

## Alternatives considered

- **Live provider-token streaming with a final safety check:** improves perceived latency but cannot prevent already-sent content from being exposed. It does not satisfy the chosen strict release contract.
- **Moderate small output chunks only:** reduces buffering, but harmful meaning can span chunks and released chunks cannot be recalled. Not the initial default.
- **Unrestricted agent loop:** more flexible, but complicates cost limits, debugging and proof that guard ordering is respected. The first product flow does not require it.
- **Generate with several models and select using a judge:** adds paid generations and judging latency without established quality benefit for the target queries.
- **Neon HTTP chosen solely for convenience:** useful for read-heavy/non-interactive work, but interactive transaction requirements must not be assumed. The selected Node driver makes these requirements explicit.
- **Queue from day one:** enables durable work but adds dispatch, retry, lease and monitoring obligations before the simple guarded flow is proven.

## Consequences

- Time to the first approved answer includes generation and checks. This is an intentional product tradeoff.
- Safety classification is fallible and must be evaluated; buffering guarantees ordering, not perfect classification.
- A single OpenRouter path remains a gateway dependency even when model fallbacks exist. An independently tested direct provider path can be added later.
- Database transactions remain short and exclude model/search calls. External provider billing cannot be made atomic with Postgres.
- The UI protocol is separate from provider streaming, making it possible to enforce approval centrally.
- Future workers can reuse the same modules and contracts, but need durable execution and at-least-once-safe processing.

## Validation

Require tests proving zero task/search calls after input denial, zero draft bytes after output denial, atomic concurrent idempotency, owner-scoped reads and cancellation/finalization fencing. Evaluate planner quality and safety false refusals on labeled cases before public launch.

References: [system design](../system-design.md), [safety policy](../safety-policy.md), [implementation plan](../../tasks/plan.md).
