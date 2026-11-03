# Workspace entry and sidebar motion

The homepage redirects to `/workspace`. The workspace is public to view and type
in; guests still establish their existing bounded, challenged trial before using
AI. Signed-in users use the existing authenticated workspace frame. Private
history, search, jobs and API ownership gates are unchanged.

Visitors and guest accounts have a compact highlighted Sign up / Log in link.
Visitor drafts use tab-scoped session storage and are restored into the composer
following authentication. Visitor shells do not load model/usage APIs or mount
session-renewal controls. Signing out returns to the public workspace.

Desktop sidebar width transitions take 180ms. Mobile dialogs use CSS discrete
open/close transitions with an immediate fallback on unsupported browsers.
Reduced-motion preferences disable navigation animations.

Validation: lint/types and 14 targeted unit tests pass. The credential-free
Cloudflare build passes its private-cache checks. Optimized real-browser entry,
visitor controls and desktop collapse/expand were verified without AI calls.
Foundation browser regressions cover public entry, private-history denial,
sign-in navigation, draft retention, navigation and reduced motion. CI and release acceptance are recorded below.

## Production acceptance — 3 November 2026

PR #27 merged as `fb7c08a93983bef7ce3044f5bfceb2b68d091cf4` after both
reviews completed cleanly on `cef922bbde9681b50f7676e74b6198233b701015`; both
inline findings are resolved. The fixes preserve the in-memory question across
route groups and restore its selected mode/model. Regression coverage sends the
actual client transport request to an intercepted offline boundary.

Quality run `41644029985` passed 891 unit/integration tests, 12 foundation browser
tests, four offer tests and 33 motion/model tests (one desktop-only geometry case
skipped on mobile). The Cloudflare build/browser job also passed. A test-only
keyboard focus bug was diagnosed from its trace and fixed without relaxing checks.

Worker `3798b39e-c89f-4732-a9aa-6f01cc6f23a7` is live at
https://perplexity.jacked.dev. Live browser verification covered authenticated
entry, sign-out into the visitor workspace, highlighted sign-in navigation with
Google's existing sign-in button available, desktop collapse/expand at 180ms, and
mobile open/close at 180ms with no horizontal overflow at 390px. The root returns
307 to `/workspace`; unauthenticated conversation APIs return 401. No application-
origin console errors were observed; Turnstile emitted opaque third-party frame
console entries on the sign-in page. No challenge bypass or guest AI call was used.

The final bundle scan covered 1,801 generated files with no configured secret
matches. The deployed application source equals the reviewed source; the final
follow-up changes only the browser test. Runtime vars/secrets, maintenance schedule,
budgets and existing unknown-cost holds were retained. No migrations, purchases,
provider calls, quota increases or credential changes were made. Rollback can
restore the previous Worker `81951d40-d983-4808-b104-60be2aa7ba14` without a database
change.

## Follow-up: direct Google sign-in and policy footer

Workspace Sign up / Log in buttons start the existing Google social sign-in
action directly. The client SDK loads on demand when clicked. The old `/sign-in`
marketing screen is removed; bookmarks and existing authentication redirects go
to the workspace, retaining a safe OAuth error message when needed. Failed
authorization stays retryable without automatically restarting OAuth.

Visitor policy links now belong to a separate flex footer, outside the message
composer. It rests at the bottom on mobile without a fixed overlay. Local browser
checks at 390×844 and 390×560 placed the footer bottom at 844px and 560px; the
composer remained above it, including with the OAuth-error banner visible.

The local direct sign-in action restored the existing Google user's authenticated
workspace. Lint/types and credential-free Cloudflare build/cache checks pass.
Browser regressions cover direct Google navigation with a mocked provider,
retryable failures, legacy route redirects and mobile footer bounds. This follow-up is deployed; production acceptance is recorded below.
No paid AI requests, budget changes or OAuth credential changes were made.

## Direct sign-in production acceptance — 3 November 2026

PR #28 merged as `0d9c3cf1222f7bf4cde576c77defed043810ac1e` after clean code
and security reviews on `f8b4420aecd907cea67188875038d694b43760fc`. The review
finding updated the opt-in guest-trial browser entry, picker and usage assertions.
The CI failure was an ambiguous alert selector matching Next's route announcer;
scoping it to the workspace message preserved the assertion without weakening it.

Quality run `41669430459` passed 891 unit/integration tests, 16 foundation browser
tests, four offer tests and 33 motion/model tests (one desktop-only case skipped
on mobile). The Cloudflare build/browser job passed too. The separate opt-in
Neon guest-trial browser suite was updated but not rerun in this release.

Worker `d152529a-2f0f-456d-8cce-dcfbca65c7a4` is live on the custom domain. A
live Sign up / Log in action returned the existing Google account directly to
its authenticated workspace. Before login, the footer ended at y=844 on a
390×844 viewport and y=560 on 390×560; the composer stayed above the footer.
Private unauthenticated conversation APIs still return 401. The legacy sign-in
URL renders a streaming redirect to the workspace rather than a marketing page.

The credential scan covered 1,797 generated files with no configured secret
matches. The application source matches the reviewed commit; the final fix
changes tests only. Runtime variables, secrets and the maintenance schedule were
retained. No migration, budget/credential change or paid AI call was made. Provider
usage readback stayed $0.076405046; all ceilings and existing holds were unchanged.
Rollback can restore Worker `3798b39e-c89f-4732-a9aa-6f01cc6f23a7` without a
database change. Earlier paid-account/first-payment and admitted-cancellation
acceptance limits are unaffected.
