# Ordered implementation record

User scope updated October 24: complete privacy controls, then guest trials,
model selection and usage controls. Defer Razorpay integration until the website
is hosted. Paid tiers and checkout remain disabled. Open one PR after the
remaining implementation passes verification. Live AI testing is authorized only
within the existing non-resetting $1 OpenRouter key cap.

## Privacy controls

Implemented in 6aa5e3d: owner-scoped JSON export, deletion with active-run fencing,
content purge, financial receipt preservation, and bounded retention cleanup.
Desktop/mobile browser flows cover accessibility, export, cancellation and
confirmed deletion. Restricted-runtime Neon verification includes deletion of an
in-flight synthetic run. Migrations 0017/0018 applied only to development.
Generated Drizzle snapshots account for most commit lines.

## Guest identity, catalog, credits and usage

Implemented in 5967f6f and e34f062, with focused corrections 0187f4f and 77a61c4:
DB-backed anonymous sessions, durable trial markers, trusted-edge rate limits,
safe ownership transfer, six guest credits, 40 free monthly credits, curated
Economy/Standard models, atomic reservations, immutable credit ledger and usage UI.
Existing operator-issued grants retain spending until expiry; no cap reset.
Migrations 0019/0020 applied only to development.

Public guest creation additionally requires server-verified Turnstile tokens.
Public missing configuration fails closed; loopback development remains usable.
Hosted keys and real challenge/provider-callback acceptance remain pending.
Billing and Premium are disabled. See docs/guest-access-and-credits.md.

## Verification evidence

- Lint, TypeScript and 634 offline tests across 72 files pass.
- Real restricted-role Neon grant/admission/linking/ledger permissions pass.
- Desktop/mobile browser checks cover guest entry, model restrictions, approved
  answers, two-credit charging, exhaustion, foreign access, durable trial limits,
  accessibility and responsive layout. Privacy flows verify export and deletion.
- Live curated-model smoke: eleven HTTP 200 provider calls; all three answers
  passed citation/output validation; input blocking, planning and evidence gates
  also exercised. Known smoke cost $0.001032, zero unknown OpenRouter receipts.
- Real in-app browser Tavily research completed with three cited sources and
  five source entries, persisted across reload, and charged two credits once.
- OpenRouter key remained at $1 with no reset. Final observed usage $0.13723455,
  remaining $0.86276545. Incremental verification spend approximately $0.00181.
- Cold local live progress 7.2s; approved answer 37.5s. Warm saved-answer LCP
  452ms desktop / 664ms mobile, CLS 0.0015 / 0.0103, no observed long tasks.
  Warm cache figures do not establish cold production performance.

Local evidence: .artifacts/trials-final-check.log, trials-build.log,
trials-browser-verified.log, trials-privacy-browser.log, trials-neon.log,
catalog-live-smoke.json, trials-live-timing.json and trials-live-answer.png.
Artifacts are ignored and contain test evidence; no secrets are committed.

## Still gated before public launch

The eight PR11 findings explicitly deferred by the user remain unresolved,
including older intent loss in safety history. Smoke tests do not replace broader
current-version semantic safety/answer-quality evaluation. Hosted Google guest
linking, real bot challenge, production migrations/configuration, recovery,
restore/rollback and load/latency acceptance remain pending. Razorpay onboarding,
sandbox checkout and webhook acceptance follow after hosting. No production
migration or manual Vercel deployment was performed for this change.

The pre-existing local operator test window expires October 24 at 12:30 IST.
After expiry, new paid research fails closed until an operator provisions a new
bounded window. This work does not automatically extend it or change the key cap.
