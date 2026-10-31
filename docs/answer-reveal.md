# Approved answer reveal — 31 October 2026

Fresh answers now appear progressively by word, preserving the canonical render
tree, code blocks, list numbering and atomic citation links. Typing into the
composer changes its ready state; submission adds a brief question entrance,
stage transitions and a restrained preparation shimmer. No dependency was added.

The server still completes private drafting, citation validation, output safety,
atomic persistence and the owned read before delivering the answer. This is a
client presentation change after approval, not raw model-token streaming or a
reduction in provider latency. Progress remains live throughout preparation.
Blocked/unapproved content has no new delivery path.

Boundaries are computed once using `Intl.Segmenter`, including text without spaces
and emoji. Animation uses elapsed time, runs for at most four seconds and stops
on unmount or when the page becomes hidden. “Show full answer” finishes immediately
and retains keyboard focus on the answer. Reduced-motion settings bypass reveal
and preparation animation. Saved history, status recovery and completed-result
cancellation recovery show the complete answer immediately. Server refreshes
during a new reveal retain the answer's component identity.
Browsers without native word segmentation show the approved answer immediately.

## Verification

- Seven unit cases cover structured prefixes, atomic citations, Unicode/emoji,
  lists/code, immutability, the duration bound and missing segmentation. All 52 focused reveal,
  presentation and transport cases pass.
- `pnpm test:e2e:motion`: all 12 Chromium desktop/mobile cases pass, including
  follow-ups, server-prop refresh, saved-history reload, skipping with keyboard
  focus, reduced motion and changing motion preferences during reveal. Axe finds
  no tested WCAG A/AA violations, and the monitored answer scenario has no page
  errors. The test app renders the actual UI components with controlled approved
  data, without auth, a database or inference; it is outside the deployed app.
- In-app browser inspection confirms preparation, partial text, final formatting
  and sources. Screenshots remain ignored under `.artifacts/motion-*.png`.
- Lint, generated route types, strict TypeScript and the production build pass.
- Development Neon connections time out, including a bounded standalone `SELECT
  1` probe. DB-backed guarded-search cases could not complete; this is recorded
  separately from the passing offline component checks. Failed fixture cleanup
  must be rechecked when that development database becomes reachable.
- The initial UI run was interrupted by a test-app config reload (11 passed,
  one failed navigation). The complete subsequent run passed all 12 cases.
- All eight existing production-build public browser cases pass. The first full
  local test run hit PGlite initialization deadlines while the build/browser work
  overlapped and was stopped. A serial rerun passed all 669 then-current tests;
  no test deadlines were enlarged and no tests were disabled.
- Final verification after the compatibility fix: lint, route type generation,
  strict TypeScript, all **670 tests across 84 files** (one worker) and the
  production build pass. Configured-secret scans find zero matches in the branch
  diff and built client assets; the offline preview marker is absent from
  production bundles. These local results do not replace exact-head CI/review.

The motion test command is part of Quality CI. Generated test-app output and local
evidence are excluded from lint/type discovery; test source stays checked. No
provider requests, production migrations, budget changes or deployment were made.
The combined OpenRouter cap remains **$2**. Exact-head CI/review and hosted
acceptance remain separate release gates.
