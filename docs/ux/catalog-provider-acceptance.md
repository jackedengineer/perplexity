# Catalog provider acceptance — 3 November 2026

## Hosted follow-up — 08:00 UTC

Both hosted model checks now passed. Qwen run
`d5a1fa28-ccca-4396-bdc1-66e7c69dfba1` completed in about 20 seconds with five
citations; DeepSeek run `9f147a2a-350c-4072-9a50-c6f088d8f7b3` completed in
about 28 seconds with four citations. Source panels and answer persistence were
verified in the browser. Recorded total run costs are $0.000778 and $0.001072,
including known AI stages. Search used verified free Tavily credits.

With user authorization, only the current operator day was raised $0.40 → $0.55;
all spend/holds were retained. No provider cap increase was necessary. The prior
timeout's generation receipt still returned 404, so its hold remains intact.

Tavily billing showed Researcher Free, 44/1,000 monthly plan credits, PAYG off,
0 PAYG credits and no upcoming invoice. Its authenticated usage endpoint also
reported zero PAYG usage. This evidence covers the two successful current-month
`tavily/basic` calls (one credit each). The privileged receipt CLI recorded
VERIFIED_NOT_BILLED resolutions with a hash of the saved evidence; the existing
runtime reconciliation service released $0.049222 and $0.048928. A second call
for each returned UNCHANGED. No direct reservation decrement was used.

Evidence is in ignored artifacts: `catalog-hosted-acceptance.json`,
`catalog-tavily-free-receipt-evidence.json`, `catalog-reconciliation-result.json`,
`catalog-day-budget-adjustment.json`, `catalog-qwen-live-success.png`,
`catalog-deepseek-live-success.png` and `catalog-live-picker-enabled.png`.

Remaining daily headroom: $0.185089; period headroom: $0.535010. Research is
available with both additions enabled. Gemini stays disabled. These two benign
checks are not a general reliability guarantee. DeepSeek emitted raw S-labels
inside prose alongside valid citation links; Qwen had a transient feedback-load
error. Preserve those as follow-ups rather than declaring the entire UI flawless.

## Earlier direct-provider checks and initial blocker

User authorized paid checks within existing budgets. This record distinguishes
provider acceptance against authored evidence from a complete hosted search.

| Selection | Pinned provider | Result | Draft + output gate | Draft cost |
| --- | --- | --- | --- | --- |
| Qwen3 30B A3B Instruct 2507 | nebius/fp8 | Approved, one citation | 3,292 ms | $0.000086 |
| Gemini 2.5 Flash Lite | google-ai-studio | HTTP 404, unavailable | 152 ms | Unknown; $0.0125 held |
| DeepSeek V3 0324 | siliconflow/fp8 | Approved, one citation | 8,637 ms | $0.000262 |

The input and output classifiers used the current Mistral Small 3.2/DeepInfra
production configuration. All calls retained pinned providers, no fallback,
ZDR, denied data collection, required parameters and existing maximum prices.
This is a single benign sample using authored rainbow evidence, not a broad
quality evaluation, retrieval test or reliability guarantee.

## Accounting and reproduction

`tests/live/catalog-rollout.test.ts` requires explicit paid opt-in and a server
configuration file. It verifies the ordinary key's non-resetting limit/expiry,
locks and reserves $0.05 in both current operator buckets, then settles known
cost and retains unknown costs. An interrupted process retains its reservation.
Run only when the existing account/operator/key envelopes permit more calls:

```sh
LIVE_CATALOG_ROLLOUT=1 LIVE_CATALOG_CONFIG_FILE=/absolute/ignored/config.json \
  pnpm exec vitest run --config vitest.neon.config.ts tests/live/catalog-rollout.test.ts
```

The test passing means all three outcomes were recorded, not that all three
models passed. Activation must use the individual receipt results.

Receipt: `.artifacts/catalog-rollout-16873645-4953-46b7-97f1-ed9affc6ab44.json`.
Six requests cost $0.000561 in verified rounded receipts; $0.0125 remains held
for the unavailable Gemini request. This manual probe hold is recorded in the
receipt and operator buckets; it is not a normal run for automatic reconciliation.
Do not repeat the probe or clear its hold without reviewing that receipt.
The ordinary combined $2 envelope and separate $5 paid pilot are unchanged.

## Production and browser evidence

`ENABLED_ANSWER_MODELS=economy-nano,economy-qwen,standard-deepseek` was saved on
`perplexity-production`; default GPT-4.1 Mini remains available by existing
configuration. Secret-only version `d57b6616-60d8-4063-886b-495d30c8f2c3` retains
main `8ecc982`. The live picker displayed Qwen and DeepSeek; Qwen was selected.

Hosted run `0614efdc-e9e8-4ac7-9348-bc915859b35e` timed out at INPUT_SAFETY,
before Qwen generation. The browser showed request-checking progress and a
recoverable timeout message. Its $0.05 unknown-cost reservation stays held.
OpenRouter upstream entry `gen-1793691505-a7dz9wuWVBmvLTMgDDib` exists, but the
generation-cost lookup returned 404. That is not proof of zero charge.

After that run, the current operator day has $0.036939 available, below the
$0.05 admission minimum, and the UI correctly reports research paused. The day
ends November 3, 16:55 IST. Full hosted Qwen/DeepSeek answers and citations remain
pending receipt-backed reconciliation or normal budget renewal. Do not claim
that direct provider acceptance proves end-to-end hosted success.
