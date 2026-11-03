# Catalog provider acceptance — 3 November 2026

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
