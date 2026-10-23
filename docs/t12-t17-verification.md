# T12–T17 candidate verification

PR #10 merged after exact-head code/security review and CI passed (`74f2d21`, merge `a3be5df`). New work is on `codex/query-planning-evidence-feedback`; it has not been merged or deployed. Production Neon was not migrated. Development migrations 0009–0014 add planning, versioned accounting and owner feedback; generated Drizzle snapshots account for most diff lines.

## Candidate 4739610

- Offline: 577 tests in 63 files; lint, types and production build pass.
- Restricted development Neon: 23 tests across retrieval, completion, budgets and telemetry. Runtime privilege verification confirms TLS, immutable plans/accounting snapshots, feedback RLS and no budget provisioning rights.
- Real browser with synthetic providers and development Neon: six desktop/mobile tests cover public submission, clarification, repeated identical follow-ups, conflict citations/additional sources, feedback reload and two-user rejection. Eight public foundation tests also pass.
- Local production browser profile: six cold-cache samples using a synthetic approved no-evidence answer and the same answer/feedback bundle; maximum LCP 1,340 ms, CLS 0, JavaScript 195,395 transferred bytes, no errors. These are lab measurements, not field or cold sourced-answer measurements.
- Dependency audit: one existing moderate issue; zero high/critical issues. No dependency changes in this feature.

The complete live planning sample is `.artifacts/planning-live/4739610c-adbdf8e2-8a2c-4148-9301-2d5caf4c216d/report.json`: 30/30 routes; 5/5 approved clarifications; 14/14 paired approved answers; zero invalid/unavailable plans or unnecessary clarifications. Frozen top-source selection improves from 20/25 to 25/25. Planner p50/p95: 2,605/3,949 ms including local rules; known all-role cost 11,968 microUSD, zero unknown receipts. This frozen source-selection proxy is not a real-web accuracy benchmark.

The simultaneous broader live regression is `.artifacts/live-openrouter/t12-final-4739610c-1792753883426/aggregate.json`: 66/66 deterministic critical checks and 72/72 semantic allow/block decisions match, zero unavailable; 13/13 sourced answers have valid citations/approved outputs, and all three required clarification/no-evidence dispositions pass. Category routing is **35/36 and the unchanged safety scorer remains FAIL**: `seed-output-privacy-block` was blocked as CREDENTIAL_THEFT without required PRIVATE_DATA. Do not describe this as a passed safety gate.

## Live browser evidence

Real development flows use the existing capped OpenRouter key, actual Tavily and owner-isolated Neon. The ambiguous question “Is it better?” saves NEEDS_CLARIFICATION, with only input/output guards and a skipped zero-cost planner, no search/answer calls and zero answer credits. “Explain Vercel” saves a cited answer containing both extracted-page and search-passage evidence and survives reload.

“What about its pricing?” correctly resolves to “What about Vercel pricing?” using the prior literal USER topic, with zero planner cost, but its private answer failed before publication. Three isolated calls against that saved evidence reproduced two overlong paragraph failures (1,081/1,098 characters against the unchanged 1,000-character limit). The rejected live run and all probes are retained. Answer prompt v7 explicitly targets paragraphs below 700 characters and states the 1,000-character ceiling; validation, citation requirements and output guard remain unchanged. Verification of that adjustment is recorded below when complete.

## Remaining acceptance gates

Independent human review is still required for the 30 planning expectations, preserved constraints, paired answer relevance/support and conflicting-evidence representation. The checked-in expectations are authored fixtures, not independent human labels. T14 and checkpoints C/D remain open for that work. The category-routing discrepancy above also blocks a clean broader safety release. Public guest access, paid tiers, production migrations and deployment retain their separate release gates. No failing sample is overwritten or rescored as a pass.
