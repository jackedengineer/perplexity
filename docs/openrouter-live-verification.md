# OpenRouter live verification — 23 October 2026

**Release decision: HOLD.** Funding is available and a real browser research
request completes, but the live sample does not meet the existing launch gate.
No Vercel deployment or public rollout was performed. This record supersedes the
older statement that all paid testing is pending; independent human quality and
policy-label review remain pending.

## Configuration and spending

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
