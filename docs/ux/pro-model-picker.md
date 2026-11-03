# Plan visibility and model selection — 3 November 2026

## Interaction decisions

Inspected Perplexity's anchored model menu and compact plan/upgrade pill,
T3 Chat's model descriptions and cost hints, ChatGPT's composer placement,
Claude's public sign-in/plan page, and Vibrant Design's restrained CTA styling.
The application keeps its existing charcoal/teal palette. The menu opens in
140ms, has a selected check, supports arrows/Home/End/Enter/Escape and outside
click, and disables animation for reduced-motion preferences. No animation
library or new runtime dependency was added.

Pro appears in the persistent plan link, sidebar account label and account
panel, with remaining Deep Research reports and paid-through date. The server
uses only current ACTIVE LIVE periods owned by the authenticated account. TEST,
revoked, expired and future periods do not qualify. Search credits remain a
separate allowance; the badge does not increase quotas or imply unlimited use.

## Model rollout

The curated catalog now supports these additional opt-in keys:

| Key | Model | Pinned OpenRouter provider | Credits |
| --- | --- | --- | --- |
| economy-qwen | Qwen3 30B A3B Instruct 2507 | nebius/fp8 | 2 |
| economy-gemini | Gemini 2.5 Flash Lite | google-ai-studio | 2 |
| standard-deepseek | DeepSeek V3 0324 | siliconflow/fp8 | 5 |

The public OpenRouter model/endpoint catalog was checked on 3 November 2026.
Listed prompt/completion rates were within the existing $0.50/$2 per-million
answer cap. Those catalog reads are not live generation acceptance. Gemini is
proprietary; Qwen and DeepSeek are presented as open models.

Before production activation, run the existing bounded catalog-provider smoke
with the intended runtime key, pinned providers, structured answer contract,
ZDR/data-collection restrictions and unchanged monetary reservations. Add only
passing keys to ENABLED_ANSWER_MODELS; no provider fallback is introduced.
Guests remain restricted to ECONOMY. Deep Research continues to use its separate
approved model and budget. This change does not deploy or raise any cap.

## Verification

- Database-backed access tests cover current LIVE, TEST, revoked and expired plans.
- Catalog tests cover opt-in configuration, submission keys and guest restrictions.
- Desktop/mobile browser checks cover selection, keyboard navigation, menu bounds,
  Pro versus upgrade visibility, reduced motion and menu accessibility.
- Existing answer reveal/progress/cancellation browser checks remain in the suite.
- The offline UI fixture renders the actual production components with synthetic
  entitlement data; it does not create a real paid account or spend provider funds.
