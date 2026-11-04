# Deep Research v2: evidence-led self-consistency

New submissions use `deep-research-v2`. Existing v1 jobs, checkpoints and reports
retain their original executor and reservations. Apply migration 0036 before
routing new submissions to an upgraded web/worker deployment. This branch does
not deploy production or change any provider key, account quota or operator limit.

## Processing and delivery

1. Freeze the original question, locale, UTC reference date, temporal scope and
   server-selected models in the admission transaction. Reserve all steps first.
2. Plan three complementary searches, inspect initial evidence, then perform three
   gap/counter-evidence searches and extract two selected pages.
3. Independently generate three private claim sets against the same bounded
   evidence package. Candidates cannot see each other's outputs. Each claim must
   include registry source IDs and verbatim passage quotes.
4. Judge every claim against original passages, explicitly marking support,
   conflict or lack of support. Agreement does not establish truth. The judge
   also writes Summary, Analysis, and Limitations/conflicting evidence paragraphs.
5. Validate exact quotations, exhaustive claim adjudication, supported final claim
   references, canonical citations, each section and the assembled output. Only
   then atomically publish the complete report.
6. Deliver approved sections through an authenticated, owner-scoped NDJSON stream.
   The client progressively reveals words using the existing reduced-motion-aware
   renderer. This is **approved report delivery**, not raw model token streaming:
   unchecked candidates and judge output never reach the browser.

A lost response retains the entire step cap; there are no automatic paid retries
or fallback providers. Recovery replays completed checkpoints and never reissues
an uncertain call. Cancellation fences publication and keeps unknown-cost holds.
An unavailable candidate or unsupported report fails closed rather than silently
reducing the ensemble to two models or inventing missing evidence.

## Selected routes and ceilings

Catalog and zero-retention routes checked on 2026-11-04 using OpenRouter's public
[model catalog](https://openrouter.ai/api/v1/models) and
[ZDR endpoints](https://openrouter.ai/api/v1/endpoints/zdr).

| Role | Model | Pinned provider | Per-call reservation |
| --- | --- | --- | --- |
| Candidate A | Gemini 3.8 Flash | Google Vertex global | $0.030 |
| Candidate B | Qwen3.5 397B A17B | Venice | $0.030 |
| Candidate C | DeepSeek V4.1 Flash 1017 | Fireworks | $0.030 |
| Judge/author | GPT-5.4 mini | Azure | $0.060 |
| Initial/refinement planner | DeepSeek V4.1 Flash 1017 | Fireworks | $0.012 each |

All routes require ZDR, deny data collection, forbid fallback and tools, bound
wire bytes and output tokens, and enforce maximum unit prices. Google omits an
unsupported temperature parameter. The judge uses low reasoning effort within
its existing 4,096-token and $0.060 ceilings; candidates stay on minimal/none.
The judge uses homogeneous arrays with exact
length validation; OpenAI's structured-output API rejects tuple-style JSON Schema.

Six searches ($0.090), extraction ($0.015), planning ($0.024), candidates ($0.090)
and judge ($0.060) reserve **$0.279 per run**. This fits the existing $0.40 paid
daily ceiling when it has sufficient unreserved capacity. Seven reports plus
seven bounded failed attempts require up to **$3.906** rather than $2.8035; the
pilot capacity calculation reflects this. Public checkout retains its existing
owner-approved policy and runtime caps. No funding is automatically increased.

## Time semantics

No time supplied: stable explanations are evergreen; changing topics such as
pricing, releases and regulations prefer current evidence as of admission. Older
primary background remains eligible. Electrical/ocean current is not a recency
instruction. Explicit historical dates override topical recency. Calendar weeks
start Monday in UTC; last month means the previous calendar month. Forecasts are
labeled uncertain and use existing evidence, never a future publication filter.

Historical event dates are distinct from publication dates. A retrospective may
support a past event. Only explicit publication/news date requests constrain
Tavily's publication window. Exact dates, year ranges, today/yesterday, this/last
week and this/last month have deterministic resolution. Other nuanced temporal
wording remains in the original question for planning; this is not a general
natural-language date parser. Invalid or reversed supported date ranges fail
instead of silently searching another period. The frozen scope is visible in the
report and survives replay across midnight.

## Verification and limits

- Database integration: reservations, idempotency, three private analyses, judge,
  atomic publication, ownership, recovery without duplicate billing, cancellation,
  invalid quotes, unknown receipts and historical publication filtering.
- Transport: authenticated ownership, unpublished-report denial, ordered section
  frames, arbitrary UTF-8 chunk boundaries, truncation and aborted delivery.
  Reconnecting a failed report stream is bounded; exhausting five automatic
  reconnects leaves an explicit manual reconnect action, never a paid job retry.
- Live frozen-evidence sample: three candidates and judge correctly distinguish
  an audited count of 42 from a preliminary 45 and avoid inferring treatment
  quality from the count. Exact quotes and final citations pass validation.
- Live planner sample preserves explicit 2024 scope and the named database subjects.
- Adversarial live judge evaluation: two candidates incorrectly assert an audited
  count of 45 while a third asserts 42. The final judge rejects the incorrect
  majority as unsupported, preserves 42, addresses the quality limitation and
  produces validated citations. Earlier attempts misclassified the incorrect
  claims or omitted a sub-question; those failures prompted stricter instructions
  and bounded low-effort reasoning. They are not counted as passing samples.
- Local browser: real development Neon admission/progress/publication with
  deterministic provider fixtures; separate paid provider samples above. This is
  not an all-live hosted end-to-end research acceptance run.

During bounded provider selection, DigitalOcean's Qwen route produced malformed
whitespace output and SiliconFlow rate-limited DeepSeek. Neither is used in the
final candidate. Azure rejected the first tuple schema; the homogeneous-array
schema passed. Failed calls remain recorded in local evaluation evidence.

A single synthetic live scenario is not statistical proof of improved accuracy.
Quote matching proves text provenance, not entailment; the judge can still err.
Broad independent human calibration, multilingual coverage and an all-live hosted
trial remain release acceptance work. Source support labels stay NOT_CHECKED;
this feature does not misrepresent model judgment as independent human review.

Reproduce the adversarial check only with explicit spending authorization:
`LIVE_DEEP_CONSENSUS=1 pnpm exec vitest run --config vitest.deep-consensus-live.config.ts`.
It reads ignored `.env.launch.local`, verifies the existing $1 daily key cap and
at least $0.06 headroom, allows exactly one judge call, and writes an aggregate
result under ignored `.artifacts/consensus`. The final check cost $0.004685. It is
excluded from ordinary CI and never automatically retries a failed sample.

For rollback, stop new admissions and drain/recover v2 jobs before rolling web or
workers back to code that cannot execute them. Keep migration 0036: it is additive
and retaining the constraint avoids discarding v2 history. No secrets or raw
production prompts belong in committed evaluation artifacts.
