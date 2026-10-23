# Offline baseline — 2026-10-23

Generated with `pnpm eval:offline` from committed source
`6f97b7fa0b9e84aa2df27401652df491897bae0a` with `sourceDirty: false`.
Corpus SHA-256: `773e560aa020a4de7a68f51f7aae005059ca6d3f0d5efe66d201b5ad6fea2cbd`. Policy v1;
prompt/detector versions are recorded in the generated manifest. No safety,
answer or judge model was invoked. CI retains the aggregate report for seven days.
Three named credential placeholders are expanded only in memory during tests;
complete provider-key signatures are absent from the committed corpus.

| Observation | Numerator / denominator | Result |
| --- | --- | --- |
| Critical detector/service/output-contract agreement | 66 / 66 | PASS |
| Frozen citation validity agreement | 24 / 24 | PASS |
| Semantic safety observations | 0 / 72 | PENDING |
| Human-reviewed semantic labels | 0 / 72 | PENDING |
| Reference scenarios with generated answer observations | 0 / 16 | PENDING |
| Supported sampled factual claims | 0 / 0 | null; PENDING |
| False refusals / missed required stops | 0 / 0 each | null; PENDING |
| Human-reviewed harmful completions | 0 / 0 | null; PENDING |
| Paired judge/human claim labels | 0 / 0 | null; PENDING |

Critical offline work incurred zero external provider spend. Its local elapsed
p50 was 0.12 ms and p95 2.43 ms across 66 cases, with zero missing
measurements. These are deterministic boundary timings, not end-to-end AI latency.
Live model/search cost and latency are unknown. **Overall acceptance: PENDING.**

Validation: lint, TypeScript, 501 tests in 54 files and production build passed.
Both incorrect safety labels and incorrect citation expectations were separately
introduced in disposable fixtures: each produced FAIL before fixture cleanup.
Manual-import CLI verification kept an empty synthetic sample PENDING and rejected
an outside-directory file with a fixed diagnostic. No manual test output is retained
as a real model baseline.

Final production-build browser verification passed eight public desktop/mobile
checks plus four development-Neon guarded answer/reload/cancellation checks with
synthetic providers. In-app composer interaction and console checks were clean.
Warm saved-answer lab LCP was 348 / 364 ms (desktop / mobile), CLS 0, with no observed
long tasks. Cached JS transfer was 0 and does not measure cold bundle size. Synthetic
client progress arrived at 5.02 / 4.72 s and approved payloads at 17.56 / 17.55 s;
these are development observations, not paid-model or production SLO measurements.
Disposable identities/budgets were cleaned up. Configured credentials were absent
from tracked source and client assets.

Acceptance criteria and minimum sample sizes are in [the protocol](README.md).
The existing critical guard/access/retry suite remains mandatory; finite agreement
does not prove universal safety or harmful-completion absence. Independent human
label review, actual model quality, retrieval relevance, harmful-completion
measurement, judge calibration and paid-provider performance remain pending.
T21's live verification checkbox and launch gates stay open. T12–T17 are still open.
