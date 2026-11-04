# Local boundaries and generation-provider safety

On 2026-11-04 the owner approved replacing the separate LLM classifier after
harmless self-reference repeatedly returned an unavailable verdict. This is a
change in safety coverage, not a fallback that treats classifier failure as approval.

## Runtime path

Chat, Web and Deep Research use `local-boundary-v1`. Before external calls, existing
Zod schemas, request limits, authentication/ownership, origin checks, throttles,
atomic reservations and deterministic secret/role-spoofing checks still apply.
The same finite local inspections cover outbound queries, evidence and output.
They do **not** recognize all harmful intent, indirect injections or multilingual
abuse. The answering model receives explicit safety instructions and owns semantic
refusal. No provider safety settings are disabled; provider-native policy behavior
can vary between models. This does not claim equivalence to independent moderation.

Answers remain private until schema, Markdown, citation/provenance and local output
checks pass. Public text is released only through the existing branded approval and
atomic ownership/session/attempt fences. Explicit native refusal fields and verified
moderation-shaped HTTP 403 responses become policy failures, not classifier outages.
Permission, billing and other ambiguous 403 responses remain provider failures.
Provider prose/flagged input is never echoed or logged. No automatic paid retry is added.

No production service constructs `createOpenRouterSafetyProvider` or requires
`MODEL_SAFETY` / `SAFETY_OPENROUTER_PROVIDER`. The legacy adapter and its tests remain
for historical evaluation and rollback. Old records keep their original evidence.

## Audit and accounting

Input reviews record `LOCAL_CHECK`, `local-boundary-v1` and a null model ID for local
allows. Output reviews record `guard_version=local-boundary-v1`; historical rows
default to `legacy-classifier-v1`. Only privately branded local guards can omit a
classifier provider-call receipt during finalization; string model IDs cannot opt in.
Local stages create no provider calls and charge zero. Real answer, planner, search,
extraction and unknown-cost holds retain the existing accounting. Durable jobs retain
their conservative step reservations and record local steps at zero cost. No budget,
quota, provider privacy configuration or expiry is increased.

## Deployment and rollback

Apply additive migration 0034 before serving this code. Drain existing Deep Research
jobs first: their snapshotted classifier configuration differs from new local jobs.
Do not silently rewrite existing snapshots/checkpoints. Run the development Neon
browser suite with synthetic providers before hosted checks. Confirm no active old
jobs before updating both web and durable workers. Keep the existing provider secrets
for rollback; deploying the prior artifact still works with the additive schema.
Rollback only after draining new jobs, because old code cannot execute local snapshots.

## Verification and limits

`tests/unit/local-safety.test.ts` proves no classifier network call, finite secret and
role-spoofing detection, malformed/cancelled rejection and non-forgeable branding.
`provider-refusal.test.ts` covers explicit content filters, moderation vs permission
403s and retained billing receipts. Database integration tests cover Chat/Web/Deep
Research, output withholding, ownership, cancellation, zero local cost and immutable
real provider usage. The identity-boundary corpus covers self-reference vs private-data
requests for subsequent model evaluation; these are semantic expectations, not a
claim that local checks detect all of them. Legacy classifier benchmarks are not the
release gate for this architecture.

`LIVE_NEON_E2E=1 pnpm exec playwright test --config playwright.local-safety.config.ts`
uses only the dedicated development database and a provider preload with synthetic
keys. It cannot spend the production provider budget. Hosted/native semantic quality
checks must be separately reported with exact models and costs; fixture tests alone
do not establish production-model safety accuracy.
