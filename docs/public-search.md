# T11 public guarded search

PR #4 merged after Quality CI succeeded at commit
`4dbe07fb5fc76781ff3285b5840404a4532fd8d3`. T11 builds on that approved pipeline.

## Reference and scope

Inspected the signed-in Perplexity home, researching state, completed answer,
inline citations and expanded source pane on 22 October 2026. The reference query
was “Why do rainbows form?”; no personal question was sent. At 1280×720 its narrow
sidebar is 56px, the answer column is approximately 720px, and the source pane is
320px with a 16px right margin. The current answer uses serif body text, a small
right-aligned question bubble, restrained domain citation chips, and a pinned
follow-up composer. Local comparison screenshots are ignored under
`.artifacts/reference/`. System serif fonts approximate the reference's custom
font; exact font identity and every Perplexity feature are not claimed.

Match these screens in the existing CSS system. Keep responsive source access,
keyboard navigation, reduced motion, fixed progress labels and readable errors.
Only approved source titles/URLs are visible; unapproved passages, generated
summaries and provider reasoning never become preview cards. No remote favicons
or images are automatically fetched on the user's behalf.

## Release boundary

The public route accepts one newest question and intent metadata, never browser
history, provider settings or guard overrides. Compose admission, input approval,
bounded retrieval, private drafting, output approval and atomic commit in order.
Use the installed AI SDK UI-message stream protocol. Progress is application-owned;
no private model stream is merged into it. Deliver approved response text and
source presentation only after canonical commit and a fresh ownership/session read.

Compile approved Markdown into a bounded render tree on the server. Browser
components render only explicit React elements; HTML, arbitrary Markdown links,
images and model-supplied URLs have no rendering path. Source links use server
registry values with noopener/noreferrer and no-referrer. On reload, validate the
stored payload/body hashes against the exact message before exposing presentation.
Legacy current-policy approved text remains escaped text without invented sources.

## HTTP and recovery contract

`POST /api/chat` accepts the existing strict submission schema: conversation ID,
stable client request ID, expected revision, newest text, FAST and fast-default.
Identity comes from Better Auth, never the body. The route enforces same-origin
JSON, a 16 KiB body limit and bounded body reading before atomic admission.
Missing model/HMAC/search configuration is unavailable; it creates no paid work.
The optional server-only `RUN_OPERATOR_BUDGET_KEY` selects provisioned spend
buckets. It cannot create grants, enlarge limits or be overridden by a client.

Normal preflight denials use fixed JSON errors and HTTP status codes. Accepted
work uses AI SDK 7 UI-message SSE, including its protocol header and terminal
finish. Only application-owned stage parts are emitted after input approval.
`X-Run-Id` and revision headers acknowledge an owned intent for recovery; they
contain no question or provider content. An error after headers is a fixed
in-band error plus terminal finish, never an exception message or upstream body.

The final response is read back through an owned, live-session database query.
Only a current-policy COMPLETED run with matching review/payload/body hashes
becomes a public answer. The stream includes its canonical message ID, approved
presentation, source URLs and exact frozen text. A completed retry does this
read without running providers. An active duplicate returns 409 with a recovery
ID; `GET /api/runs/:id` returns neutral progress or the committed response.
Foreign and unavailable IDs have the same fixed 404. Private evidence and
unreviewed text have no HTTP read path.

The browser sends only its stable intent through a customized `DefaultChatTransport`
and `useChat`. It never resends SDK history. An in-memory context carries a new
question across navigation; no unapproved question is stored in browser storage
or used as a title. An empty conversation starts as “New search”; only accepted
input can supply its title. Reload uses canonical server history. A later new
question starts a separate search; contextual follow-ups remain T12–T13 work.

A stopped/disconnected fast request aborts provider work best-effort and settles
under the original attempt/revision fence as CANCELLED. A lost delivery is
recovered from status/history or by rechecking the same intent, never by assigning
a fresh paid request key automatically. Stale-run expiry and unknown-cost
reconciliation remain T18 operations; process termination can prevent cleanup.

## Interface and performance decisions

The current search screen uses a 56px default sidebar, a 720px answer/composer
column, a 320px desktop source pane and a 96px composer at 1280×720. Existing
sidebar preferences remain respected. Questions appear as right-aligned bubbles;
answers use serif typography, bounded Markdown and inline domain citation chips.
The interface supports keyboard copy, citation previews, approved source links,
fixed progress, stop/recheck, refusals, empty evidence and error states.

Citation previews render in a viewport-clamped portal, dismiss on Escape/scroll
and avoid touch-generated hover. On small screens, sources use a native dialog
with focus handling, Escape/backdrop dismissal and focus restoration. The desktop
pane stays beside the answer. No inactive sharing/voting controls are presented
as working features. Motion uses short CSS interactions and honors reduced motion.

The initial performance check found 259,569 transferred JavaScript bytes for the
chat route, over the unchanged 200,000-byte budget. Active research now loads the
SDK only when a user submits; reading saved history does not require it. The
Markdown parser stays on the server. The first repeat measurement was 193,204
bytes for chat, with zero CLS; final measured evidence is recorded below.

Live browser verification uses a separate production-build server on port 3001,
real development Neon transactions and disposable identities/budget namespaces.
A test-runner Node preload intercepts only fixed OpenRouter/Tavily calls using
synthetic keys. It is never imported by application code, requires an explicit
isolated fixture configuration and cannot be selected through a route/body flag.
The main development app keeps its normal fail-closed provider configuration.
A passive cloned-response observer records actual SSE bytes and stage timing
without buffering the response consumed by the UI.

## Verification record — 22 October 2026

- Production build, lint, generated route types and strict TypeScript passed.
- `pnpm check`: 353 tests across 36 files passed.
- Restricted-role development Neon suites passed in isolation: admission 6, input
  safety 6, retrieval 7 and completion 7 (26 total). Concurrent execution of these
  heavyweight suites previously exceeded the existing 2-second lock timeout; no
  application timeout was increased to conceal that contention.
- Chromium passed 8 public checks, 6 authenticated ownership/session/history checks
  and 14 new guarded-search checks (28 browser cases across desktop and mobile).
  Provider responses were test doubles; database/session/RLS/HTTP/rendering were real.
- Captured SSE proves progress precedes approved answer delivery; blocked input,
  blocked output, unknown citations and upstream failures expose no private draft
  or reasoning. Exact reload, duplicate settlement, foreign status denial, stop
  and terminal replay passed. Axe found no A/AA violations on tested answer/error
  states; browser page-error capture was empty.
- Layout assertions passed at widths 320, 768, 1024 and 1440; source dialogs,
  Escape/focus restoration and citation preview bounds passed on mobile.
- Main-app in-app-browser checks verified the actual unconfigured-provider error
  state and an empty console; no fake providers were activated in the normal app.
- Dependency audit reports one existing moderate advisory and no high/critical
  production advisories. Database verification confirms TLS, 21 tables and the
  existing narrow runtime permissions. T11 requires no database migration.
- Configured-secret scans found zero matches in tracked/new source, branch commit
  patches and built client chunks. Fixture markers were absent from built server
  and client bundles. Cleanup verification found zero disposable test identities
  and zero test operator budget buckets after all suites finished.

At 1280×720, inspected reference and local desktop geometry align as follows:

| Element | Reference | Local |
| --- | ---: | ---: |
| Collapsed sidebar | 56px | 56px |
| Answer/composer width | approximately 720px | 720px |
| Answer/composer left edge | approximately 132px | 132px |
| Source pane width | 320px | 320px |
| Source pane right margin | 16px | 16px |
| Composer height | approximately 96px | 96px |

Final performance samples use a local production server, Chromium at 1280×800,
fresh navigation cache, no throttling and five samples per route. All sampled
routes have CLS 0 and pass the unchanged 200,000-byte JavaScript / 2,500ms LCP /
0.1 CLS budgets. They are laboratory navigation measurements; INP and field Core
Web Vitals are not measured.

| Route | LCP range | Transferred JavaScript |
| --- | ---: | ---: |
| Home | 40–104ms | 144,996 bytes |
| Sign in | 48–88ms | 161,731 bytes |
| Workspace | 324–716ms | 187,841 bytes |
| Library | 28–32ms | 162,350 bytes |
| Saved answer | 604–628ms | 193,489 bytes |

Artifacts are ignored under `.artifacts/`: desktop/mobile answer, progress,
source, citation and failure screenshots; captured wire timing; and public/private
performance JSON. Synthetic providers plus remote development Neon demonstrate
ordering, not actual model latency or quality. No paid provider smoke was run;
normal local research requires explicit evaluated model/provider configuration
and privileged budget provisioning. Citation membership is validated; factual
support remains `NOT_CHECKED`. Contextual follow-ups, stale-run reconciliation,
anonymous usage, billing and deployed-preview verification remain future gates.
