# Larger answer models and public Pro checkout

Release candidate, 4 November 2026. This builds on PR #29's dark loading and mobile layout fixes. Production activation remains separate from passing local checks.

## Model selection

| Catalog key | Model | Pinned endpoint | Answer credits | Status |
| --- | --- | --- | --- | --- |
| standard-gemini-flash | Gemini 3.7 Flash | google-vertex/global | 8 | Chat and cited Web provider checks passed |
| standard-qwen-397b | Qwen3.5 397B | digitalocean | 8 | Chat and cited Web provider checks passed |
| standard-qwen-max | Qwen3.8 Max 0902 | alibaba/us-east-1 | 15 | Pending privacy-compatible routing; cannot be enabled |

The two verified models remain opt-in through `ENABLED_ANSWER_MODELS`. Guests keep economy models. Signed-in users see the credit price before submitting. Search and favorites use the existing picker. Qwen Max's registry entry is retained, but `catalogConfiguration` rejects it even if someone adds its key to the environment allowlist. The owner chose to preserve current privacy settings.

Provider discovery used OpenRouter's model endpoint and ZDR endpoint catalogs on 4 November. Initial AI Studio/Alibaba requests returned 404 because no eligible ZDR endpoint matched. Vertex requires reasoning for Gemini 3.7: the adapter uses minimal reasoning, excludes reasoning from returned content, and retains a total 1,200-output-token limit. DigitalOcean supports Qwen 397B's structured output and explicit `tool_choice:none`. No fallback, tool execution, logging opt-in or account privacy setting was enabled.

Official references: https://openrouter.ai/docs/guides/features/zdr and https://openrouter.ai/api/v1/endpoints/zdr . Google Vertex can retain flagged prompts for abuse monitoring; the privacy page now discloses this existing routing-policy allowance rather than promising unconditional zero retention.

## Versioned accounting

Migration 0033 adds accounting version 3 without rewriting historical runs, calls, settlements or receipts. The larger models reserve 90,000 microUSD per run. Their answer stage has a 48,000 ceiling; all stage ceilings total 85,250. With at most 20,000 wire bytes and 1,200 output tokens, the largest permitted price ($2/$6 per million) is bounded by 47,200 microUSD. Existing versions retain their old ceilings. Unknown outcomes retain holds; late receipts reconcile against the original buckets. The ordinary account and operator ceilings do not increase.

## Public purchasing policy

The owner explicitly requested open checkout, manual funding and no funding messages in customer-facing UI. `PAID_CHECKOUT_ACCESS=PUBLIC` removes the one-person seat, prepaid-capacity, delivery-window and pilot-specific daily-intent restrictions from purchasing. Existing per-owner open-intent uniqueness, idempotency, request rate limits, verified Google identity, captured-payment verification and signed webhooks remain. Public billing status does not depend on a successful best-effort worker wake hint.

This is a sales-policy change, not new inference funding. The $5 paid operator/key ceilings, the separate existing verification envelope, unknown-cost holds and job admission limits remain intact. Paid work can pause at those runtime limits until the owner replenishes/renews them. A subscription remains one billing month for ₹999 and seven completed reports, at most fourteen started attempts, with no automatic renewal. No real charge or mandate was completed during verification.

`PILOT` (the default) preserves the older funding gates for deployments that have not explicitly selected public sales. `ENABLE_RAZORPAY_LIVE_CHECKOUT`, valid production credentials and the production jobs configuration are still required. Turning these off remains an operator emergency stop.

Pricing now links directly to `/billing`. Its signed-out Google button returns to `/billing` after successful sign-in. The Billing page always offers Refresh, including accounts with no previous subscription.

## Evidence and release steps

- Final local validation: lint, type checks and all 905 offline tests across 139 files pass. The version-three regression covers admission/planning/retrieval/persistence/reconciliation; it caught a missing accepted catalog/price pair before the final run.
- The credential-free Cloudflare production build passes. CI additionally runs the browser regression suite. Offline evaluation still reports PENDING semantic/human-review cases; passing tests do not imply independent answer-quality acceptance.
- Live provider fixture checks: Gemini Chat 2.30s / Web 3.37s; Qwen 397B Chat 1.97s / Web 2.14s. These are small authored fixtures, not an end-to-end live search benchmark.
- Receipted live model-check spend: 3,082 microUSD across successful samples. Failed routing checks have no cost receipt and remain conservatively booked in the ignored local test ledger. No provider cap was increased.
- Local browser: select/search/favorite the new models, 390px menu bounds, visible pricing-to-Billing link, enabled billing action, visitor Google action. No card details or payment were submitted.
- Artifacts: `.artifacts/graphite/expanded-models-live-round3.json`, `expanded-models-allowance.json`, `models-verified-check.log`, `models-final-build.log`, `expanded-model-menu-mobile.png`, `public-upgrade-mobile.png`.

Before release: pass CI/reviews, apply migration 0033 using the owner migration workflow, deploy the reviewed build with `PAID_CHECKOUT_ACCESS=PUBLIC`, append only the two verified keys to `ENABLED_ANSWER_MODELS`, and verify hosted checkout visibility/model selection. Preserve all existing production secrets and budgets. The earlier intermittent safety/planner incidents are not resolved by this catalog/UI change and remain tracked separately.
