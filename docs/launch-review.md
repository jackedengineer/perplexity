# Interface, performance and launch review

Review date: 22 October 2026. Scope: T11 signed-in search, approved answers,
citations/sources, composer, progress/recovery, and local production performance.
Next.js 16.4.2 / React 19.3.1; existing plain CSS; no animation dependency added.
This record distinguishes a reviewed implementation from a public launch.

## Review corrections

The PR's automated security review completed without findings. Code review found
three correctness issues, each reproduced and fixed before merging:

1. Rename now locks the owned conversation row before checking active runs. This
   serializes with admission/completion and refuses all active phases, including
   expired active rows awaiting reconciliation. The revision and reservation stay
   intact, so normal failure settlement still works. The originating UI also
   disables Rename while researching. Other tabs receive a fixed 409 error.
2. Admission resolves an existing intent before checking live provider availability.
   Only a new run executes a synchronous provider-configuration preflight, before
   attempt counters or budget reservations. Active and completed retries work while
   providers are unconfigured; retained HMAC keys are still required to verify intent.
3. Recovery polling has no Stop control because it cannot cancel the remote run.
   It says “Checking saved result”. Cooperative Stop remains available for the live
   POST; durable remote cancellation/reconciliation remains T18.

## Visual and interaction review

Full review of the requested search surfaces, using the in-app browser and isolated
Chromium desktop/mobile tests. Perplexity reference: the existing neutral rainbow
query, question opening, answer/list text, citations, expanded sources and pinned
composer. Measured geometry remains 56px sidebar, 720px answer/composer, 320px
source pane, 16px pane right margin and 96px composer at 1280×720.

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Reference computed paragraph/headings, local question/answer/list | Corrected body size, spacing and hierarchy |
| Surfaces | Question bubble, composer, source pane, focus states | Corrected bubble radius/background and composer focus |
| Animations | Copy feedback, button press, composer focus, progress | Short explicit transitions; reduced motion retained |
| Icons | Existing SVG set, copy/check states, source counters | Cross-fade copy state; stable counters |
| Performance | Production bundles, CDP timeline, paint/long-task/Event Timing observers, API probes | Reproducible local evidence; no field INP claim |

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `src/app/(research)/answers.css` answer text | 18px body / 20px heading; 18px paragraph gap | 16px/26px body, 18px/28px heading; 8px gap | Match measured reference density and hierarchy |
| LOW | Same file, question bubble | 18px radius, opaque fill | 16px radius, reference 3% foreground fill | Match reference surface geometry |
| MEDIUM | Same file, composer focus | Inner textarea rectangle competes with the outer surface | Visible outer accent border; inner outline removed | Preserve accessible focus without a nested box |
| LOW | `approved-answer.tsx`, answer copy | Abrupt icon swap; repeated timers can clear fresh feedback | Two icons cross-fade; timer resets/cleans up | Interruptible feedback with a persistent “Copied” cue |
| MEDIUM | Same file, citation focus | Automatic focus scrolling can dismiss the preview | Position after focus scrolling | Keyboard preview remains usable after copying/scrolling |
| LOW | `answers.css`, source-count button | Instant press state | 120ms background/transform transition, 0.96 press scale | Consistent tactile feedback without layout animation |

Rejected: staggered answer/typewriter reveal would delay already approved content;
an animation library would add JavaScript for simple transitions. Unapproved source
snippets and fetched third-party favicons remain excluded. Proprietary Perplexity
fonts, brand icons, account-specific banners and unsupported controls are not copied.
The visual match covers measured supported surfaces, not pixel identity of every
Perplexity feature or asset.

Copy transitions are inspected at 10% playback through Chromium's Animation domain;
clipboard content must exactly equal canonical approved text. Reduced-motion tests
verify transitions stop. Citation focus, native source dialog/Escape/focus restoration,
320–1440px overflow checks, Axe and page-error capture remain part of browser checks.

## Reproducible profiling

Run `pnpm build`, then `pnpm start --hostname 127.0.0.1`. With the dedicated development
Neon configuration, run `pnpm perf:profile --before` on the baseline and
`pnpm perf:profile` after changes. It creates disposable identities and an empty
conversation, reads only owned APIs, captures sanitized DevTools timeline events,
and removes the fixture. It never calls a paid provider.

Three cold-cache samples per route/profile: desktop 1280×800 without throttling;
mobile 390×844 at CDP 4× CPU. No network shaping. Five unthrottled API samples per
operation include response-body completion. Actual approved-answer reload and SSE
samples come from the guarded browser test server with provider doubles and real
Neon. Lab interaction durations are not field INP or a population p95.

Sources: [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/reference),
[CDP Tracing](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/),
[CDP Emulation](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/).
The installed Next.js CSS/production guides were read before changing code.

## Deployment decision

Public launch is not ready. The current environment has no OpenRouter/Tavily keys,
explicit model/provider assignments or research HMAC keys. Google OAuth is configured
for localhost only. Login does not provision research allowances. A successful local
provider-double run does not establish actual model quality, safety or paid latency.

Before public Vercel launch:

- Configure evaluated providers and run a spending-capped live quality/safety/latency
  check; provision intended user and operator allowances through a privileged process.
- Use a stable HTTPS origin and matching Google callback; configure isolated production
  runtime database/auth secrets and verify session cookies, owner boundaries and
  streaming on that deployment. Keep the direct migration-owner URL out of runtime.
- Place Node functions near the Singapore Neon project and verify the actual Vercel
  plan's duration/connection constraints against the 45-second application deadline.
- Complete the applicable backlog gates for stale-run/unknown-cost reconciliation,
  abuse controls, retention/deletion, CSP, error monitoring and rollback/restore.

The Vercel account recognizes the repository as importable; no project was created
and no deployment was triggered while these gates were unmet. A protected preview
with research unavailable is a separate option, not evidence of a functional public
research launch. No paid plan, billing activation or provider purchase was performed.

## Measured results

Three samples per route/profile; maxima below are across the three profiled routes.
The search-shell measurement uses an empty conversation. The separate approved
answer reload samples are warm-cache and cannot establish cold-transfer size.

| Lab profile | Before max LCP | After max LCP | After max CLS | After search-shell JS | After max interaction duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop | 708ms | 780ms | 0 | 193,642 bytes | 56ms |
| Mobile, 4× CPU | 636ms | 932ms | 0 | 193,642 bytes | 64ms |

The unchanged 2,500ms LCP / 0.1 CLS / 200,000-byte JavaScript budgets pass.
JavaScript grew by 153 bytes from the prior T11 shell. Desktop had zero long tasks;
mobile's longest observed hydration task was 96ms (maximum observed blocking-time
sum 62ms). These small samples show no budget failure, not a statistically proven
speedup or a field p95. Input-delay maxima were 1ms desktop / 9ms mobile; Event
Timing samples cover navigation toggles and typing, not the population's INP.

| API operation | Samples | Median response including body | Maximum |
| --- | ---: | ---: | ---: |
| Owned conversation list | 5 | 225ms | 237ms |
| Owned conversation detail | 5 | 294ms | 307ms |
| Owned empty history | 5 | 292ms | 331ms |
| Unavailable run (fixed 404) | 5 | 219ms | 275ms |

These are local-production-server requests to remote Singapore development Neon,
not Vercel timings or a production latency SLO. No authorization caching was added.
Approved-answer warm reload: desktop LCP 344ms, mobile 336ms, CLS 0, no observed
long tasks. Cached JavaScript transferred 0 bytes on those reloads.

Actual HTTP/SSE capture against the isolated fixture server:

| Event since request start | Desktop | Mobile |
| --- | ---: | ---: |
| Admission Server-Timing | 1,533ms | 1,575ms |
| First public SEARCHING stage | 4,235ms | 4,264ms |
| PREPARING_ANSWER | 10,238ms | 10,257ms |
| CHECKING_ANSWER | 13,684ms | 13,698ms |
| SAVING_ANSWER | 14,553ms | 14,569ms |
| Canonical approved answer/text | 16,666ms | 16,776ms |

Response is `text/event-stream`, `private, no-store`. Input approval precedes the
first public stage. Drafting, whole-response output approval and atomic commit
precede answer content. The approved answer is delivered immediately as a whole;
there is no artificial typewriter delay or private token stream. A completed-intent
replay took approximately 724–732ms without provider execution. Provider doubles
make this evidence of ordering/delivery, not real model/search latency. A future
live trace must include every safety/search/model call and its cost.

Verification: production build, lint/types and 363 tests in 37 files passed. Seven
restricted-role Neon admission cases include the new independent-connection rename
race. Both desktop/mobile recovery regressions passed. The guarded matrix passed
14 non-positive cases; the two positive cases initially exposed the focus-scroll
preview bug, then passed after the fix, together with both recovery cases. Copy
success, exact clipboard text, 10%-speed transitions, reduced motion, canonical
reload, safe source links, source modal/Escape, Axe, page-error capture and layout
bounds all passed on the corrected positive paths. No assertion or timeout was
weakened. Public and authenticated regression results are recorded at completion.

UI review verdict: **Approve for the measured T11 scope**. Unverified: proprietary
font/asset pixel identity, unsupported Perplexity surfaces, live provider quality
and latency, deployed cookies/OAuth, field INP and public-launch operational gates.
Public launch verdict: **Hold** for the concrete deployment requirements above.

Completion checks: 8 public and 6 authenticated desktop/mobile regressions passed
on the final production build. Together with the 16 guarded/recovery cases, this
covers 30 distinct browser cases. The new clipboard/focus regression passed on
both devices after correction. The after-profile script passed all unchanged
budgets. Final lint/types passed; no configured-secret matches were found in
tracked/new files, branch patches or client chunks. Fixture markers were absent
from built server/client output. Cleanup confirmed zero test identities and zero
test operator buckets. Audit retained the documented moderate loader advisory
and no high/critical production advisories; TLS/21-table/narrow-grant checks passed.
