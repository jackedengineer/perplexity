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

## Release status

Cloudflare build, current-head CI/reviews, production migrations and live acceptance
are pending at this checkpoint. No new paid subscription or Deep Research charge
was simulated in production. Existing payment/real-customer acceptance limitations
remain recorded in the main release checklist.
