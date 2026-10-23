# PR #11 review fixes

CI on `e61edb4` passed. Code review on the runtime-equivalent `7fc7be2` raised seven P2 findings; security review reported no findings. Those results do not approve the updated branch. Merge remains conditional on fresh code/security review and CI for the new head.

The fixes through `a3b4913` are split into four focused commits (generated Drizzle metadata is mechanical):

- Planner v4 accepts valid multibyte originals within the submission byte envelope and selects only whole recent context turns within that envelope. A 23,000-byte maximum complete planner request, including schema/prompt, remains within the existing 2,000 microUSD planner stage cap at configured price ceilings and 1,024 output tokens. The answer adapter retains its existing 20,000-byte limit. Original text is unchanged. Whole turns that do not fit are excluded, never truncated.
- Context-derived vocabulary, numbers, explicit constraints and freshness are eligible only when the current question actually contains a reference. Independent new topics cannot inherit a prior budget or technology. Clarifications also require provenance or allowlisted neutral clarification vocabulary; unrelated safe questions are rejected. These remain conservative lexical checks, not proof of semantic equivalence.
- A shared freshness mapping keeps validation and retrieval consistent, including `आज` → day. Publication dates remain provider estimates.
- Invalid titles exceeding the evidence contract's 300-character limit are rejected before the top-five ranking cutoff.
- The transport preserves validated admitted revisions from response headers, stream metadata and owned recovery/cancellation status. New follow-ups after failure use that revision without waiting for an answer commit or page refresh. Metadata for a different run cannot change it.
- Operator outcomes expose clarification terminals separately and include them in the service-availability denominator without calling them completed answers.

Development-only migration 0015 extends the immutable plan-version check to planner-v4; existing versions remain valid. No production migration or deployment is performed. The Vercel team dashboard was checked on October 23: no Perplex project/deployment exists; the prior import setup is unfinished.

Verification before review: the original four planning/ranking regressions failed, and a real desktop browser reproduced stale revision 0 after admitted revision 1. The fixes pass 587 offline tests in 63 files, lint, types, and focused integration tests including Hindi retrieval and clarification outcome SQL. The production build and expanded real-browser regression results, followed by a capped live planning sample, are reported on PR #11 once complete; restricted artifacts remain in ignored `.artifacts/pr11-*` and `.artifacts/planning-live/`.

The earlier `7fc7be2` live results in the T12–T17 record are preserved historical evidence, not live verification of planner-v4. Independent human T14 intent/relevance/support review and conflict representation remain pending. Public guest access, paid tiers, deletion/export, operational activation and production release gates are separate from merging these technical changes.

## Second review round

The fresh reviews on `37f155f` both completed. Security reported no findings; code review raised five P2 findings. They are addressed in separate commits, with red regression tests retained in the ignored local verification artifacts:

- Input/query prompt v7 fits a maximum accepted 4,000-emoji question, including maximum-length permitted model/provider identifiers, into a 20,960-byte safety request ceiling. At the configured $0.10/$0.40 per million token price ceilings and 384 output tokens, the conservative byte-based bound is at most 2,250 microUSD. Stage reservations, provider routing, deadlines and retries remain unchanged. Output context allows bounded server JSON framing around the complete original; oversized complete requests still fail closed. Output protocol v6 records that framing change.
- Planner v5 recognizes one/ones references, requires a positive subject anchor in each search query, retains all subjects across split queries and keeps shared budgets, currency symbols and exclusions on each query. Subject numbers may be split across queries. These are conservative lexical guarantees, not semantic equivalence.
- An ANSWER plan's locale must match the accepted request locale (default `en`). The immutable plan language reaches the answer adapter and answer-v8 prompt as validated metadata. Legacy runs default to English. Mocked integration tests verify propagation; actual translated answer quality remains unverified.
- Optional extraction now requires more than 35 seconds remaining: its 8-second ceiling plus evidence safety (5), drafting (12), output safety (5) and a 5-second persistence allowance. Otherwise the run uses inspected search passages. The absolute run deadline stays unchanged.

Development-only migration 0016 extends the immutable metadata constraint to planner-v5 while preserving historical versions. It was applied to the explicitly pinned development Neon database. Production remains untouched.

Verification: six initial regression failures reproduced the findings. The fixes pass lint, type checking, all 595 offline tests in 63 files, and the production build. Desktop/mobile browser regression results are recorded on PR #11 after completion. The first browser run rendered the approved answer but exposed an obsolete fixed-count assertion requiring optional extraction; the updated regression checks every mandatory stage, at most one extraction, and identical provider-call IDs before/after replay. The initial failed/interrupted run is retained. Checks use synthetic provider responses and do not spend OpenRouter credits.

The complete planner-v4 live samples failed availability checks with pinned DeepInfra HTTP 429 responses; the bounded diagnostic is retained in `.artifacts/pr11-bounded-provider-diagnostic.json`. No additional paid calls were made for this round. Planner-v5/input-v7/output-v6/answer-v8 require a fresh authorized capped live evaluation and independent human review before production launch. Historical successful samples are not attributed to these changed prompts or validators. Merge remains gated on exact-head CI, both fresh reviews and resolved inline threads; public launch and Vercel deployment remain separate gates.

The browser runner now generates one isolated operator-budget namespace per invocation and shares it with workers. An interrupted invocation cannot contaminate the next one with overlapping test windows; application admission guards and budgets remain unchanged.
