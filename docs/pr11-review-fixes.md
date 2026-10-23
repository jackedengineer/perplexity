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
