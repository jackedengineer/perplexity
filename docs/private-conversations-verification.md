# Private conversations verification

Date: 2026-10-22. Scope: authenticated private conversation metadata and approved history, local production build, and the dedicated development Neon project. No deployment or live AI integration is certified by this record.

## Implemented and verified

- Application UUID profiles map uniquely to Better Auth subjects. Every conversation list/detail/history/update query includes the authenticated subject; bodies cannot select an owner. Missing and foreign UUIDs produce the same safe 404.
- Creation retries compare an immutable normalized-title fingerprint and an owner-scoped intent UUID. Four concurrent real-Neon requests returned one 201 and three 200 responses with exactly one conversation ID. Changed-payload reuse fails validation; renames reject stale revisions.
- Conversation lists use bounded keyset pagination and escaped literal title search. Timestamp precision is milliseconds in PostgreSQL, matching JavaScript cursors; a regression fixture with microsecond timestamps exposed and verified the correction.
- History is chronological and paginated. Unapproved assistant drafts are excluded by the repository before serialization. The live browser fixture loaded 23 approved messages across pages while a draft was absent from both DOM and response HTML.
- Mutation routes validate session, exact origin, JSON media type, a streamed 2 KB byte cap and strict schemas. Responses are private/no-store with request correlation and server duration. Structured logs exclude user text and query strings.
- Reviewed migrations `0001`/`0002` are applied to development Neon. Both URLs verify the certificate chain and expose eight expected tables. The runtime has profile SELECT/INSERT, conversation SELECT/INSERT/UPDATE and message SELECT, without message INSERT or schema CREATE. Owner credentials remain separate. Provisioning after a fresh migration grants the same permissions.

## Verification evidence

| Check | Result |
| --- | --- |
| `pnpm check` | Lint, strict TypeScript and 33 isolated unit/integration tests pass |
| `pnpm build` | Optimized production build passes |
| `pnpm test:e2e` | Eight public desktop/mobile checks pass |
| `pnpm test:e2e:neon` | Four live desktop/mobile checks pass; synthetic users cleaned up |
| Focused desktop visual regression | Reference composer geometry and complete private workflow pass |
| `pnpm db:verify` | PostgreSQL 18, eight tables, verified TLS and expected runtime privileges |
| Clean archive at `7e4c445`, without local environment | Frozen/script-disabled install, lint/types, 33 tests and production build pass |
| Secret scan | Zero matches for configured credential values in tracked/candidate files |

Live browser checks cover create/reload, failed-create retry, rename and focus restoration, owner isolation through both API and UI, concurrent metadata creation, approved history pagination, failed-history retry, library search/empty results, and overflow checks at 320/768/1024/1440 px. Session renewal, sign-out/revocation and protected navigation remain covered. Axe reports no violations for the selected WCAG A/AA rules on the tested screens; this is not a full manual accessibility audit.

A longer-history fixture revealed a keyboard-inaccessible scroll region. The named history region is now focusable, pagination preserves the reading position, and completion restores useful focus and announces loaded messages. Native dialogs/popovers support Escape and keyboard navigation. Reduced motion remains respected.

## Reference UI coverage and limits

Inspected Perplexity in the browser: signed-in home, composer, model/search/attachment menus, research progress, saved answer, thread actions, rename dialog, filtered/empty library, and collapsed sidebar. Reference evidence uses a neutral rainbow query. Personal conversation content was not copied into the repository.

The private workspace recreates the 240 px / 56 px sidebar, dark palette, 56 px headers, composer geometry, compact library, action menu and rename dialog. At the measured 876×804 viewport, automated assertions match the reference composer at x=304, y≈321.6, width=508, height=120 within half a CSS pixel. Local ignored screenshots are in `.artifacts/reference/` and `.artifacts/workspace-reference-viewport.png`.

Exact visual parity is limited by the proprietary reference font and differing product capabilities. The current Perplexity home also exposes different serif/sans variants by mode. This implementation uses the inspected Search variant with system sans typography. Model selection, attachments, sharing, voice and AI answers are clearly unavailable; account/privacy copy reflects this application. Mobile layouts are tested responsively, but an exact reference mobile comparison is not claimed. Complete answer/citation UI belongs to the guarded search milestone.

## Performance evidence

Local production build; Chromium 1280×800; five fresh-cache samples per private route; no CPU/network throttling. A synthetic authenticated identity has one empty conversation. Artifacts contain route templates rather than real conversation IDs.

Initial workspace/thread JavaScript exceeded the existing 200,000-byte limit (201,522 / 202,407 bytes). Moving browser response schemas to [Zod Mini](https://zod.dev/packages/mini), independently from server input transformations, reduced transfer by 21,511 bytes per screen. The same validation constraints and the full test suite still pass. The budget was retained; subsequent keyboard-access fixes added 110 bytes on the thread, which remains below it.

The final repeated measurement observed:

| Route | Maximum LCP | Maximum CLS | Maximum JS transfer |
| --- | --- | --- | --- |
| `/workspace` | 800 ms | 0 | 180,011 bytes |
| `/library` | 32 ms | 0 | 162,161 bytes |
| `/search/:id` | 624 ms | 0 | 181,006 bytes |

Five authenticated API samples per operation observed server durations of 217–266 ms for lists and 289–322 ms for detail/history. These include session checks and network round trips to Singapore, and are not p95 estimates or deployed SLAs. Streaming HTML TTFB can precede private data readiness; LCP and API durations should be considered separately. AI streaming and field INP are not measured.

Reproduce against a running production server with `pnpm perf:check --private`; this creates and removes a synthetic development identity. `pnpm perf:check` retains the public-page baseline checks. Budgets remain LCP ≤2.5 s, CLS ≤0.1 and transferred JS ≤200 KB. Final repeated measurements are stored in `.artifacts/private-performance.json` and `.artifacts/performance.json`.

## Remaining work and recovery

T02's AI boundary/policy contracts and T05's run/credit admission remain next. No public endpoint writes messages or calls models/search. Metadata title validation does not claim semantic AI moderation. Anonymous ownership, deletion/export, metadata abuse limits, active-run fencing, production CSP, deployed-preview verification, field monitoring and operational recovery remain launch work.

The changes are on `feat/private-conversations` in focused commits; no remote, push, merge or deployment was performed. Application rollback can return to the foundation commit while retaining the additive conversation tables. Do not drop tables or reverse timestamp precision in a data-bearing environment; use a separately reviewed migration if a schema correction is needed. Existing dependency follow-ups in the foundation record remain open.
