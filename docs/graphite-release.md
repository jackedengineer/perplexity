# Graphite workspace release — 3 November 2026

## Behavior

- Neutral Graphite surfaces, a new original speech mark/favicon, one centered
  reading column, and compact CSS transitions. No animation dependency added.
- Searchable model picker with per-account device-local favorites, keyboard
  selection, explicit credits per answer and the server-approved model catalog.
- Owner-scoped chat pins and a debounced title-search dialog (Ctrl/Cmd K).
- Chat makes no planner/search/extraction calls. It retains input/output safety,
  private drafting, session/ownership fences, accounting, cancellation and recovery.
  Web retains the cited retrieval pipeline. Deep Research creates a separate
  durable report with verified Pro access; it does not inherit chat history.
- Edit/resend and retry-with-model create new turns; originals remain saved.
- Verified Pro state and remaining reports appear in the sidebar and mobile/desktop
  header. Allowance includes existing reservations. No client-side paid grant.

## Verification

- All 890 unit/integration tests passed across a full serial run (821 assertions)
  and the four setup-timeout suites rerun serially (69 assertions). The first
  parallel run also had setup timeouts; no assertion or timeout limit was weakened.
- Lint and type checks pass. Production dependency audit: no high/critical findings;
  one existing moderate advisory remains.
- Real development browser: live Chat answer saved/reloaded with zero retrieval,
  model filtering/favorite persistence, pin persistence, title search, mobile
  layout and paused-budget state. Temporary development Pro display fixture showed
  four reports remaining, then only the synthetic fixture rows were removed.
- Isolated browser fixture using actual components: keyboard model selection inside
  native revision dialog, new retry turn preserving the original, edited submission,
  Stop, source links, and no horizontal overflow at 320/768/1024/1440 pixels.
- Updated automated browser coverage for searchable/favorite models, revisions and
  the Graphite home heading. CI must pass before release acceptance.
- Local test budget allowed one live Chat run. Subsequent local admissions correctly
  paused below the 50,000-micro-USD reservation. Existing holds and caps untouched.

### Review follow-up

- The initial head passed both Quality CI jobs: 891 unit/integration tests,
  foundation/offer/browser coverage and the Cloudflare build.
- Fixed both code-review findings: Sources now reserves a separate desktop column;
  library submit, clear and Escape preserve the pinned scope. Browser checks at
  1200/1280/1440 pixels and the mobile Sources modal pass; lint/types pass.
- Added CI browser regressions for geometry and pinned/unfiltered search navigation.
  Fresh review and CI on this follow-up remain required before deployment.

## Deployment order and rollback

1. Pass CI and code/security review; build Cloudflare without Next-recognized local
   environment files. Runtime secrets remain in Workers settings.
2. Apply only migrations 0031 (nullable chat pin timestamp) and 0032 (allow CHAT in
   the existing run snapshot constraint) to the explicitly verified production DB.
   Both have been applied in development. No entitlement/budget migration is added.
3. Deploy the verified bundle using `wrangler.production.jsonc`, retaining secrets,
   domain, scheduled recovery, billing settings and existing provider caps.
4. Verify authenticated Chat/Web/mode controls, saved history/pins, citations,
   progress, cancellation, upgrade and paid-access gating on the live domain.

For rollback, restore the captured prior Cloudflare Worker version. Retain both
additive migrations and all run/accounting rows; do not delete paid usage or holds.
If the previous UI cannot render saved CHAT payloads, use a forward UI fix or stop
new submissions while restoring compatibility rather than deleting history.

## Production acceptance — 3 November 2026

- PR #26 merged as `8a158f497f766de5939f59f897b93b3e27d48610` after both
  reviews completed cleanly on `4b9db132dd5179ee84a0a823483d141517306eaa`.
  Both review threads are resolved. Quality CI run `41632044851` passed:
  891 unit/integration tests, 10 foundation, 4 offer and 29 motion/model browser
  tests; the desktop-only geometry case is intentionally skipped on mobile.
  The separate Cloudflare build/browser job also passed.
- Production migrations 0031/0032 applied to the verified Singapore Neon target;
  the journal now contains 33 migrations. The nullable pin column and CHAT snapshot
  constraint were read back. No budget or entitlement mutation was applied.
- Cloudflare Worker `81951d40-d983-4808-b104-60be2aa7ba14` serves
  https://perplexity.jacked.dev. Runtime secrets/vars, the custom domain, billing
  settings and the every-minute maintenance schedule were retained. The final
  bundle scan found zero configured secret matches across 1,790 generated files.
- Live browser: model filtering, visible credit costs, Qwen favorite persistence,
  pin persistence after reload, Cmd-K title search, Chat/Web/Deep controls,
  non-destructive model retry and edited prompts all passed. Three approved answers
  remain in one saved conversation. The Web answer renders three citations and
  distinguishes two additional retrieved sources. At 1280px the answer/composer
  end at x=920 and Sources starts at x=944. Mobile 390px has no horizontal overflow;
  the model picker fits and Sources opens/closes as a native modal.
- Live Chat completed in 9.079s using GPT-4.1 nano and 8.014s on retry using Qwen.
  Each made only input-safety, answer and output-safety calls: no retrieval.
  Editing the prompt into Web mode completed in 19.030s with GPT-4.1 mini.
  These are three samples, not latency percentiles. Progressive approved-answer
  reveal and visible request/answer-checking progress were observed.
- Known provider cost for those runs totaled $0.001530. The Web run retains its
  $0.048789 unknown-cost hold for search/extraction; no holds were erased. The
  verification key remained capped at $1.80 within the existing combined $2
  envelope; readback usage was $0.076405046. The independent $5 paid pilot is unchanged.

### Explicit acceptance limits

- The available live account is Free. Deep Research correctly shows Upgrade to Pro
  without granting access. Pro badge/report allowance display was verified using
  the approved development/browser fixtures and CI, not a fabricated LIVE paid
  period. A real paid account and paid Deep Research execution were not tested in
  this release. Existing first captured-payment acceptance remains pending.
- After these three successful runs, the account reached the existing five-answer
  daily limit. Two cancellation probes were rejected before admission; the first
  Stop raced with that rejection and displayed a conservative unconfirmed-stop
  message. No fourth run or provider call was created. Fresh admitted cancellation
  remains pending after the daily reset; offline cancellation coverage passed.
  Monthly credits can still be visible when this separate daily answer cap is reached.
- The ordinary verification key/operator period still expires November 5 at
  11:48 UTC. No expiry, quota, budget, key or paid pilot window was extended.
