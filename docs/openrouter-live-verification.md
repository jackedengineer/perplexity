# OpenRouter live verification — 23 October 2026

**Release decision: HOLD.** The classifier and citation fixes pass the complete
technical rerun below. Independent human review, clarification handling and the
remaining operational/deployment gates still prevent release acceptance.
No Vercel deployment or public rollout was performed. This record supersedes the
older statement that all paid testing is pending; independent human quality and
policy-label review remain pending.

## Repaired candidate — immutable full rerun

Revision `b101d4f` was committed before the run and verified unchanged with a clean
tracked tree afterward. The corpus hash is unchanged. Safety now uses
`mistralai/mistral-small-3.2-24b-instruct` on the explicit `deepinfra/fp8` ZDR
endpoint (0.075 / 0.20 USD per million input/output tokens); answers retain
`openai/gpt-4.1-mini` on Azure. Routing/privacy/price caps, token limits, deadlines,
no fallback and no retries remain enforced. The candidate endpoint was checked
against OpenRouter’s public model-endpoint and ZDR catalogs before dispatch.

The classifier returns one `classification` enum plus policy version instead of
independently generating decision, categories and retryability. The server maps
that atomic value to the unchanged policy-v1 verdict contract. Unknown, legacy,
filtered, truncated and malformed output still fails closed. Input prompt v3
clarifies that current first-person self-harm distress selects fixed supportive
content; evidence/output prompts are v2. Verified non-reasoning models omit
unsupported reasoning controls without permitting provider reasoning elsewhere.

Private answer prompt v2 uses AI SDK `Output.object` with bounded paragraphs and
source-ID enums drawn from the selected evidence. The server renders markers
from those IDs, then applies the existing citation/Markdown and whole-response
safety gates. It never guesses missing citations or exposes an unapproved draft.
Billed receipts are captured before SDK schema rejection as well as on success.

| Full rerun measurement | Result |
| --- | --- |
| Critical offline boundaries | 66 / 66 pass |
| Semantic safety | 72 / 72 observed; 36 expected ALLOW and 36 expected stops correct |
| Classifier outages / observed false refusals / missed stops | 0 / 72; 0 / 36; 0 / 36 |
| Answer coverage / syntactically invalid citations | 13 / 13; 0 |
| No-evidence disposition | 1 / 1 |
| Clarification disposition | 0 / 2; planner T12 remains unimplemented |
| Independent reviewed labels/completions/claims | 0; pending |
| Semantic latency | p50 1,256 ms; p95 2,333 ms; n=72 |
| Answer-case latency | p50 3,325 ms; p95 7,793 ms; n=16 including non-answer cases |
| Recorded model cost | 3,754 + 3,672 = 7,426 micro-USD; no missing receipts |

The unchanged scorer reports **PENDING**, not PASS: syntactically valid source
IDs do not establish factual support. No sampled quality or harmful-completion
rate is claimed without independent review. This finite corpus does not prove
universal model safety or future provider availability. All 99 HTTP requests
returned 200, with no selected retries replacing failures. The preceding second
run is retained as diagnostic only because source files changed while it finished;
its clean-start manifest is not immutable-execution evidence. The original first
run below is preserved, rather than rewritten as a success.

The previously failing MDN reader question was resubmitted through the real
browser, Tavily and the repaired models. All four classifiers allowed it, the
structured draft validated, and four source URLs rendered and survived reload.
The browser console had no warnings/errors. First public progress arrived at
6,043 ms and approved delivery at 32,102 ms; the run execution took 30,091 ms.
This single observation is not an end-to-end p95. Database verification found
six provider calls, one settlement, five user credits charged, 1,369 micro-USD
known model cost and one Tavily credit. The remaining 48,631 micro-USD stays held
because Tavily USD cost is unknown. Reload did not dispatch another provider call.

Authenticated key metadata at 08:23:14 UTC showed **$0.02948 total used**,
**$0.97052 remaining**, a **$1 non-resetting cap**, and the unchanged expiry.
The browser account balance was $4.97; auto-top-up remained inactive. Raw results
are local-only in `.artifacts/live-openrouter/third-run/`, with browser accounting,
screenshots and key metadata alongside. No raw corpus, answers or credentials
are published as CI artifacts.

Regression verification: lint/types, 526 tests in 55 files and the production build
pass. Eight public and eight guarded desktop/mobile browser cases pass, including
approved citations/reload/ownership, input/output refusal and search failure.
The guarded regressions use provider doubles, separate from the paid observation.
Eighteen fresh private navigation profiles pass the unchanged 2,500 ms LCP,
0.1 CLS and 200,000-byte JS budgets: max LCP 712 ms, CLS 0 and JS 193,719 bytes.
Twenty metadata API samples have median/max ms: list 221/225, detail 295/296,
history 296/298, missing run 238/255. These are local lab timings with development
Neon, not field INP or hosted performance. The production audit still reports
one moderate tooling advisory and no high/critical advisories.

## Original candidate configuration and spending

The browser showed $4.99 available after a $5 credit purchase. Auto-top-up was
inactive. The dedicated launch key had been changed to $2; it was reduced to the
requested **$1 total, non-resetting cap** and verified after reload. Its expiration
remains 29 October 2026 at 23:42 IST. An authenticated key-metadata read at
07:46:48 UTC reported $0.011131 used and $0.988869 remaining on that key. This is
observed usage at that instant, not a forecast or the account balance.

The ignored `.env.launch.local` contains the following candidate assignments;
this file is mode `0600` and is not loaded automatically by Next.js or uploaded:

| Role | Model | Provider selector | USD / million input / output tokens |
| --- | --- | --- | --- |
| Safety | `openai/gpt-4.1-nano` | `azure` | 0.10 / 0.40 |
| Answers | `openai/gpt-4.1-mini` | `azure` | 0.40 / 1.60 |

The public endpoint and ZDR catalogs listed active Azure endpoints supporting
structured outputs, response format and tool-choice controls. The base `azure`
selector can match regional variants; the unchanged per-request price caps still
filter unaffordable variants. ZDR, denied data collection, no fallback, no tools,
no plugins and strict parameter matching remain enforced. Current sources:
[endpoint API](https://openrouter.ai/docs/api/api-reference/endpoints/list-all-endpoints-for-a-model),
[ZDR API](https://openrouter.ai/docs/api/api-reference/endpoints/preview-the-impact-of-zdr-on-the-available-endpoints),
[provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

## Measured sample

The initial compatibility call returned HTTP 404 before inference: both selected
non-reasoning models reject even disabled `reasoning` controls under
`require_parameters: true`. Commit `fe8438b` omits those controls only for the two
verified models, preserving explicit opt-out for other models and every routing,
privacy, token and price constraint. The same application adapters then completed
live input, evidence, drafting, citations and output-release smoke checks.

The complete frozen-corpus run used source revision `c17ba7a` with a clean tree,
policy v1, the existing v1 prompts and corpus SHA-256
`773e560aa020a4de7a68f51f7aae005059ca6d3f0d5efe66d201b5ad6fea2cbd`.
The single-process evaluation limited dispatch to 150 requests and held at most
$0.15 locally, beneath the separate $1 provider-key cap. It made **96 requests**.

| Measurement | Result |
| --- | --- |
| Finite offline critical boundary checks | 66 / 66 pass |
| Semantic safety cases observed | 72 / 72 |
| Expected ALLOW | 30 ALLOW, 0 BLOCK, 6 UNAVAILABLE |
| Expected policy stop | 24 BLOCK, 0 ALLOW, 12 UNAVAILABLE |
| Unavailable semantic checks | **18 / 72 (25%)** |
| Frozen answer cases observed | 16 / 16 |
| Expected answer approved | **12 / 13** |
| Required no-evidence disposition | 1 / 1 |
| Required clarification disposition | 0 / 2; T12 planner is not implemented |
| Human-reviewed labels, completions, factual claims | **0; pending** |
| Semantic-check latency | p50 1,309 ms; p95 3,322 ms; n=72 |
| Answer-case latency | p50 3,237 ms; p95 7,921 ms; n=16, including non-answer cases |

The safety confusion matrix uses synthetic authored labels, not independent human
ground truth. Zero observed missed stops does not establish universal safety or
measure harmful released completions. No supported-claim or citation-coverage
quality percentage is claimed without sampled human-reviewed claim spans.

The sample's known recorded cost was 4,395 micro-USD for semantic checks plus
2,977 micro-USD for answer cases. Seven semantic observations lacked a usable
receipt, so the scorer correctly leaves the full sample cost unknown. HTTP
receipts and the dedicated-key usage establish that spending occurred; neither
missing costs nor outage cases become zero-valued successes.

Diagnostics reproduced contradictory verdicts such as ALLOW with a required-stop
category, plus upstream `content_filter` finishes. Neither is converted to ALLOW
or silently repaired. A separate diagnostic prompt experiment was not promoted:
it retained filtered responses and produced a false refusal on a benign case.
Commit `3ef79af` preserves validated usage fields even when a completion is
filtered or malformed; the verdict still fails closed and unknown call outcomes
still require reconciliation. It does not retroactively change the original run.

## Real browser and persistence evidence

An isolated local production-build server on port 3002 used development Neon,
the capped provider key, and a dedicated development-only operator allowance.
Production database contents, Google OAuth and normal `.env.local` were not
changed. Temporary development user/operator allowances expire after 24 hours;
the combined provider allowance is $0.20 across the overlapping windows.

Two browser requests used actual Tavily basic search and the configured models:

- The MDN ReadableStream question reached private drafting but failed citation
  validation. No draft answer or sources were released; the fixed unavailable
  state was displayed. The run settled with zero user answer credits charged.
- The rainbow question passed all four semantic boundaries, generated an answer
  with four citations, opened the sources panel and restored the exact approved
  answer after reload. The database has six provider-call records and one
  settlement; the run completed in 26,473 ms from admission to terminal update.
  It charged five internal answer credits and recorded 1,160 micro-USD of model
  usage plus one Tavily search credit. Tavily USD cost remains unknown, so the
  conservative remainder of the reservation stays held rather than being guessed.

These are two observations, not a p95 end-to-end performance benchmark. Browser
reload did not create a second run or another set of provider calls. The sources
panel explicitly states that factual support has not been independently checked.
Raw observations, source material and screenshots are local-only under ignored
`.artifacts/live-openrouter/`; they are not CI artifacts or committed content.

## Remaining launch gates

The [evaluation protocol](../evals/README.md) remains authoritative: address
classifier availability/consistency and citation failures, rerun the complete
sample without replacing failures with selected retries, and obtain independent
human policy-label/completion/support review. Clarification still needs T12.
PR #10 review fixes now bind observations to exact frozen evidence, enforce
non-answer output contracts, count all expected answers in coverage, and require
CI to retain the exact aggregate report, including its hidden parent directory.

Production OAuth/branding, confirmed Vercel hostname, runtime-secret installation,
production migrations after the initial setup, retention/deletion, exercised
restore/rollback/kill-switch procedures, hosted auth/isolation and the T23–T24
release evidence remain unfinished. Funding alone does not satisfy these gates.
See [production setup](production-setup.md) and [the backlog](../tasks/todo.md).

## Regression verification after fixes

`pnpm check` passes lint, type checking and **508 tests in 54 files**. The current
production build passes. Eight public browser checks pass on desktop/mobile, and
four guarded development-Neon browser checks pass for approved delivery,
citations/reload/ownership, cancellation and no paid replay. Those four regression
checks use deterministic provider doubles; they are separate from the two real
provider browser observations above. The production dependency audit reports one
moderate advisory and no high/critical advisories. A scan of all 22 generated
static files found no configured server-secret values. A further live safety
receipt probe confirms that rejected output retains known billed cost.
