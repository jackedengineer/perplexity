# T08–T10 guarded answers

The pipeline is internal until T11 connects admission, guards, retrieval and final
committed delivery. No public submit endpoint, raw draft stream or provider
reasoning is enabled by these tasks. Existing conversation UI remains usable.

## Private generation

Pin AI SDK 7 and the matching OpenRouter provider. Use `generateText` for one
nonstreaming attempt, no tools, no retry, no telemetry input/output recording.
The original approved question and exact selected passage IDs/text are data;
source URLs and unrelated conversation history are not sent to the answer role.

Require explicit server-only MODEL_ANSWER and ANSWER_OPENROUTER_PROVIDER settings
alongside OPENROUTER_API_KEY. There is no default model, model alias fallback,
client override or paid-account activation. Answer routing requires a single
provider, ZDR, no data collection, supported parameters and fixed price ceilings.

The adapter caps its serialized request at 20,000 UTF-8 bytes, response at 24,000
bytes, output at 1,200 tokens / 4,000 characters and generation at twelve seconds
within the original run deadline. Unfinished/refused/tool-call/oversized output
is unavailable, not a truncated success. Provider failures never expose prose.

Drafts stay in bounded process memory. No-evidence runs skip answer generation;
the fixed insufficient-evidence response must still pass output approval. A
citation is a provenance pointer, never a factual-verification guarantee.

Usage values are independent of answer text. Convert reported decimal USD to
integer micro-USD using conservative upward rounding; missing/malformed values
remain unknown. Never replace an unknown provider outcome with zero usage or
automatically repeat it. Final settlement must preserve that distinction.

Protocol references: [AI SDK generateText](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text)
and [OpenRouter AI SDK provider](https://github.com/OpenRouterTeam/ai-sdk-provider).
Dependency installation uses pinned versions and disabled scripts; the existing
moderate audit advisory remains, with no high/critical production advisory.

## Output approval

Parse Markdown as an AST. Reject HTML, links, images, definitions, unsafe
schemes, unknown citation IDs and citation syntax hidden in code/escapes.
A deterministic failure cannot be overridden by a classifier ALLOW. The initial
answer role may write headings, lists, emphasis, quotes and code, but cannot
create arbitrary links. Future rendering must keep raw HTML and autolinks off.

Construct the visible source registry from the selected run package, not from
model-written URLs. Number unique citations by first appearance, include only
cited sources and preserve passage IDs/content hashes. Support remains
NOT_CHECKED; citation membership does not establish factual accuracy.

The semantic output guard inspects the complete answer plus every visible title,
URL and source value, using the original question as data context. A distinct
output-role prompt has no tools or permission to rewrite content. Missing,
stale, malformed, timed-out or rejected verdicts return only fixed safe text.
Clarifications and the fixed no-evidence answer use this same gate.

Approval creates a deeply frozen payload registered in a private WeakSet. JSON
cloning, object spreading, a matching TypeScript cast, or passing the storage
schema cannot manufacture the in-process capability accepted by finalization.
The storage schema validates shape only. Commit code must independently verify
ownership, run/attempt/revision/policy, source membership and original deadline.

The browser still reads committed approved history through the existing owner
checks. No API route or Server Action exposes these private preparation helpers.
Provider cost data and draft text never belong in progress events or logs.

Stored payload digests use the runtime schema's deterministic field order, so
JSONB key ordering cannot accidentally change the canonical response hash.
Hash the complete approved payload separately from the exact UTF-8 message body.
The latter binds reviewed text to the database's assistant-write policy; neither
digest authorizes release by itself. Citation/source membership is rechecked
against the run's relational evidence before a committed message is created.

Output-verification coverage includes explicit schema overrides, reference-style
links, encoded citations, repeated/out-of-order citations, unsafe unused metadata,
legitimate Markdown and Unicode, frozen-object mutation and stale/unknown guards.
The cases prove deterministic boundaries and adapter behavior with test doubles;
they do not establish multilingual classifier accuracy or factual support rates.

## Provider attempt and storage records

Before any paid stage, insert its unique run/stage attempt under the owner lock.
The sum of fixed stage caps must fit the original provider reservation; neither
model output nor caller-provided settings can enlarge it. The first profile uses
5,000 micro-USD for each of four safety roles, 8,000 for search and 20,000 for the
answer role, within the original 50,000 hold. These are conservative exposure
allocations, not vendor billing guarantees. Privacy/price/account controls still
need verification with the actual application credentials before live release.

Record outcomes and nullable actual cost/tokens separately from content. A
completed search reports Tavily credits; its monetary cost remains unknown until
reconciled. A provider failure can still have a known partial charge. Finish cost
recording after cancellation/fencing, but never treat that as continuation
permission. A duplicate or uncertain attempt is not automatically repeated.

New admissions carry accounting version 1; older runs remain version 0. This
prevents a missing historical provider record from being silently interpreted as
zero spend. Output-review/message FKs are deferred within a transaction so the
review can authorize the assistant insert. RLS binds the exact message body hash
and rejects extra hidden JSON parts. Citation FKs bind message, run, source and
passage together; run settlement receipts are unique and append-only.

Database tests retain default hook deadlines. PGlite boots a WASM Postgres per
test file, so the full suite uses two workers to avoid CPU/memory contention.
This preserves test assertions and timeouts rather than masking slow failures.

## Atomic completion and settlement

Claim ANSWER once before generation. Move to CHECKING_OUTPUT only after the
private draft finishes under the same run attempt/revision/deadline. A caller
that loses this claim returns existing status; it cannot cancel the winning
attempt. A stale failure handler cannot settle or terminate a newer fence.

The final transaction locks the live DB session and owned run, rechecks session
expiry/revocation and the 30-day absolute cutoff, and verifies current input
approval, retrieval expiry, output/answer attempts and exact citation metadata.
Session expiry is checked again in the final conditional run update. No cached
session alone authorizes committing an answer after logout.

Insert output review, exact approved assistant text, same-run citations, unique
settlement receipt, sequence update and COMPLETED state together. Return only
canonical run/message IDs after commit; a rollback returns no response bytes.
A matching completed retry loads the existing message without calling models or
settling usage again. Database uncertainty is recovered from canonical state,
not by automatically regenerating a paid draft.

Customer answer credits settle once for an approved substantive ANSWER. Fixed
no-evidence responses, clarifications and failures release those credits. Known
provider micro-USD moves from reserved to settled independently of customer
credits. If any attempt/cost is unknown or belongs to legacy accounting, retain
the entire remaining monetary hold. When all costs are known, release only the
unused difference. Reported costs over a stage cap or original reservation block
completion and require reconciliation; never hide them as zero or overspend a
bucket. Unknown-held receipts are immutable audit records; later reconciliation
must use explicit adjustments rather than silently changing their history.

All four original DAY/PERIOD user/operator buckets settle from the admitted
reservation IDs, even across a period boundary. Lock buckets in stable order and
require sufficient reserved balances. Runtime grants permit settlement columns
and provider outcomes but still deny budget-limit, HMAC, accounting-snapshot,
review, citation, receipt and excerpt mutation. History excludes assistant rows
whose policy version is no longer current, as well as unapproved drafts.

## Verification record — 22 October 2026

The final verification uses the production Next.js build and the dedicated
Singapore development Neon project. No paid model or search request is made.
The browser fixtures commit through the real restricted runtime role, then read
through the application's normal authenticated UI/API; no test-only route exists.

| Layer | Evidence |
| --- | --- |
| Isolated database/unit suite | 320 tests across 32 files; all migrations applied to fresh PGlite databases |
| Restricted-role Neon completion | Seven passing cases: canonical commit/receipt, four concurrent callers, output denial, RLS/grants, session revocation, mutated source metadata, cross-run citation FK |
| Existing Neon regressions | Six admission, six input and seven retrieval cases pass with the new migration and provider accounting |
| Real Chromium browsers | Eight public checks plus six authenticated desktop/mobile checks, including approved-answer reload and rejected-draft isolation |
| Accessibility/runtime | Browser scenarios assert WCAG A/AA Axe checks and no page errors |
| Database setup | Migration 0006 applied; TLS, 21 tables, three message RLS policies and narrow runtime grants verified |
| Build/dependencies | Strict TypeScript, zero-warning lint, production build and high-severity production audit gate pass; one existing moderate advisory remains |

The completion integration tests also cover injected transaction rollback,
current input quarantine, unknown/partial costs, no-evidence credit refunds,
revocation/expiry, stale attempts and revisions, cancellation, duplicate receipts,
stage overages and forged approval objects. A late provider outcome may update
its STARTED attempt after a failure receipt commits; the immutable receipt and
remaining unknown hold stay unchanged until explicit reconciliation.

The history browser regression seeds current, stale-policy and unapproved rows
separately. Only current approved answers survive pagination/reload. The second
browser identity receives the same 404 for an inaccessible conversation; a
blocked generated answer appears in neither HTML nor history response bytes.
Saved screenshots are ignored local artifacts:
`.artifacts/approved-history-desktop.png` and
`.artifacts/approved-history-mobile.png`.

Final cleanup found zero synthetic admission/browser users and zero synthetic
operator budget buckets. A configured-secret scan found no matches across 194
tracked/new files or the new commit history. Environment files and screenshots
remain ignored.

Provider completion recording uses one owner-constrained conditional UPDATE.
It avoids an unnecessary multi-query owner-lock transaction on each network
result, while retaining the run/identity/STARTED conditions and immutable caps.
The restricted-role Neon suite verifies this query on actual PostgreSQL.

Local production browser measurements use five fresh-cache samples per route,
1280×800 Chromium and no network/CPU throttling. They are lab observations, not
field Core Web Vitals or a streaming/model latency benchmark:

| Route | LCP range | CLS | Transferred JavaScript |
| --- | --- | --- | --- |
| `/` | 40–52 ms | 0 | 144,998 bytes |
| `/sign-in` | 48–52 ms | 0 | 161,733 bytes |
| `/workspace` | 320–336 ms | 0 | 180,011 bytes |
| `/library` | 32–44 ms | 0 | 162,161 bytes |
| `/search/:id` | 332–376 ms | 0 | 181,006 bytes |

Conversation list/get server timing was 217–220 / 292–299 ms, including the
remote development database. The answer/Markdown dependencies remain outside
client bundles. INP and public answer delivery are not measured in this slice.

## Operating and recovering this slice

Before applying 0006 elsewhere, use a reviewed migration job with its direct
owner URL. The web process receives only the restricted pooled URL. Keep the
application submit path disabled until the migration, grants and TLS verification
pass. `pnpm db:generate` should report no schema drift afterward.

Deploy compatible code before enabling T11. Configure explicit evaluated model
IDs/provider slugs and API keys in the server secret store; missing settings
produce safe unavailability. Do not create a default paid model as a fallback.
Run the opt-in Neon suites only against disposable development fixtures. Never
copy development OAuth/session secrets into preview or production.

For a stuck CHECKING_OUTPUT run or uncertain database response, inspect canonical
run/review/message/receipt state with an authorized operational tool. If the
transaction committed, use the existing message ID; never regenerate simply
because the original response was lost. If it rolled back, no draft is public.
The paid attempt still prevents automatic replay. Recovery/expiry of abandoned
holds needs the explicit T18 reconciliation job before public release.

For unknown Tavily monetary cost, missing OpenRouter usage or a late outcome,
retain the monetary hold. Reconcile against vendor billing with an append-only
adjustment and an idempotent external reference; such a job is not implemented
here. A reported overage fails closed and requires investigation. Do not edit a
receipt, raise an admitted cap or clear an unknown value to zero to unblock it.

If rolling application code back, preserve these additive tables, receipts and
RLS policies. Older code cannot safely generate new accounting-version-1 work
without compatible adapters; keep public submission disabled. Never drop the
assistant review policy or temporarily grant unrestricted message insertion.

T11 remains the next product slice: compose the guarded execution route, publish
fixed progress states, render approved Markdown/citations and reload canonical
responses. Actual provider routing/privacy compatibility, classifier quality,
search relevance, factual citation support and capped live spend remain separate
release checks. The internal fixture result is not evidence of live model quality.
