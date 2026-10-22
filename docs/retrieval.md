# T07 bounded retrieval

This slice is internal. There is no search/submit endpoint or source panel yet.
T08–T11 must add private drafting, output approval, settlement and delivery.
Input approval alone never permits raw evidence to reach a browser.

## Initial query path

The server loads the original approved first question from the admitted run's
ALLOW review. No caller-supplied question, query plan, source list, limit, model
or auth subject enters the application entry point. The first question must be
a single line of at most 300 UTF-16 characters. Follow-ups, long questions and
ambiguous references need T13 planning/clarification rather than truncation or
invented context. This mechanical first-question path does not claim to detect
all natural-language ambiguity.

The exact outbound query gets a fresh local/semantic safety check before Tavily.
Only that query is sent to search; conversation history is never attached.
Provider work runs outside database transactions. A claimed search cannot be
replayed automatically after timeout, cancellation or an unknown outcome.

## Fixed transport envelope

| Control | T07 value |
| --- | --- |
| Tavily endpoint | `https://api.tavily.com/search` |
| Calls | One; no retries, fan-out or fallback |
| Depth/topic | `basic` / `general` |
| Results/chunks | Five results, three chunks per result |
| Automatic parameters | Disabled |
| Generated answer | Disabled and discarded if returned anyway |
| Raw pages/images/favicon | Disabled; no direct URL fetching |
| Provider response | 100,000 bytes, bounded UTF-8 JSON |
| Search deadline | Eight seconds, capped by the original run deadline |
| Search usage | Exactly one reported Tavily credit; otherwise unavailable |
| Query/evidence classifier | Five seconds each, capped by run deadline |
| Stage allocation | At least 15,000 micro-USD already held in the reservation |

The stage allocation is a conservative estimate within the 50,000 micro-USD
initial run hold. It is not a vendor billing guarantee. Tavily account spending
controls, provider-call accounting and final settlement are required before live
release. Unknown charges stay held; neither missing usage nor an interrupted
search is recorded as zero cost. Customer answer credits, Tavily API credits and
micro-USD remain different units.

## Evidence selection and trust

Only bounded search passages are used initially. Extract and direct page fetching
are not needed for T07. Retrieval may return NO_EVIDENCE; generation must not
silently replace missing evidence with apparently sourced model memory.

Validate every result's shape. Exclude invalid URLs, credentials, local/IP host
identifiers, executable/hidden markup, high-confidence injection patterns and
malformed text. Inspect the complete accepted result before taking an excerpt.
Results over 4,000 text characters are excluded conservatively. This finite local
inspection is not a complete secret detector or prompt-injection defense.

Canonicalization normalizes URL syntax/host, drops fragments and only known
tracking fields (`utm_*`, `fbclid`, `gclid`, `msclkid`). Document query parameters,
parameter order, HTTP versus HTTPS, path case and trailing slash are preserved.
No network request is made to validate a source URL. The URL remains untrusted
display data and cannot authorize network egress.

Keep provider ordering; score is not a factual reliability probability. Assign
server source IDs, UUID passage IDs and SHA-256 hashes of exact selected text.
Each source contributes one excerpt of at most 1,000 UTF-16 characters, without
splitting surrogate pairs. The complete serialized registry plus passages is at
most 7,500 UTF-8 bytes. Metadata is part of this budget and safety inspection.
These limits are deliberately narrower than T02's general FAST contract.

Inspect the complete selected registry in one isolated evidence-classifier call.
Use a distinct evidence-role prompt; source content is data, never approved
conversation history, system instructions or authorization. A malformed/stale/
unavailable verdict fails closed. An ALLOW is not factual verification and is
not final output approval. Nothing from a denied batch is persisted as content.

## Storage and access

Persist exactly the reviewed package under its run, with a 30-day expiry.
Use relational source and passage records with composite run-membership FKs.
The application must authorize through the run owner on every read/write.
The shared runtime database role does not implement per-user RLS.

A retrieval record tracks the one claimed attempt and fixed outcome metadata.
Original query text already exists as an approved question; do not duplicate it
in diagnostic records. Denials keep only fixed outcome/verdict/version metadata.
No provider error, raw rejected passage, URL or title enters public errors/logs.

Use the admission lock order: owner advisory lock, conversation row, then run.
Recheck attempt, state, conversation revision, policy and absolute deadline before
publishing the private evidence package to the next internal stage. Cancellation
or a changed fence prevents persistence. A commit with an unknown client outcome
must be recovered from state rather than repeating external work.

Conversation deletion cascades through run/source/passage data. Expired evidence
cannot be loaded for drafting. Scheduled physical expiry/deletion and backup
retention are T22 operational work; the expiry field alone is not a deletion job.
Rollback application code while retaining additive tables, safety metadata and
held reservations. Never zero budgets or relax message RLS to recover a run.

## Protocol references

[Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)
defines the basic search cost, explicit request controls and usage response.
The implementation uses the documented HTTPS protocol without adding an SDK.

## State and retry contract

| Condition | Result |
| --- | --- |
| Missing verified session | UNAUTHENTICATED before DB/provider construction |
| Missing model/provider/search settings | CONFIGURATION_UNAVAILABLE; no paid work |
| Foreign/missing run | NOT_FOUND without source metadata |
| Run still checking input | Existing in-progress status; no search |
| PLANNING with valid approved first question | Insert STARTED receipt and claim SEARCHING |
| Duplicate claim | Existing active/terminal status; never a second search |
| Outbound-query denial/unavailability | Fixed denial; zero Tavily/evidence calls |
| Valid search response | Recheck fence, transition PREPARING_EVIDENCE |
| No usable sources | Persist NO_EVIDENCE receipt; no evidence model call |
| Evidence denial/unavailability | Fixed denial, metadata only; no stored sources |
| Approved bounded package | Atomic READY receipt, sources, passages and GENERATING |
| Late fence/revision/ownership change | No package commit or automatic retry |
| Provider timeout/unknown response | Unavailable; held usage remains unknown |
| Expired record/run deadline on private read | No evidence returned for drafting |

Only the session-checked service in `src/server/search/service.ts` is an
application entry point. The injectable factory supports isolated tests; its
subject and dependencies are trusted server arguments, never browser fields.
The read entry point needs no live provider configuration, since it loads an
already inspected package. It still checks session, ownership, state, attempt,
revision, policy, record expiry and the original run deadline.

A source is identified by a stable run-scoped S1–S5 key. PostgreSQL uniqueness
rejects duplicate source keys/URLs within a run. A composite FK rejects a passage
linked to a source from another run. PostgreSQL recomputes each SHA-256 digest
from UTF-8 passage text, independently of TypeScript validation.

The RLS policies authorize source/passage INSERT only under a READY retrieval
receipt with both guard decisions ALLOW. The runtime can update only fixed
retrieval outcome/verdict/usage columns. It cannot update/delete excerpts,
extend evidence expiry or modify policy/attempt/model metadata. As with T06,
this shared role is a trusted application credential, not protection against
arbitrary SQL execution with a compromised runtime credential. Application
ownership checks remain mandatory; raw source tables have no public API.

## Verification — 2026-10-22

- `pnpm check`: lint, strict types and 220 unit/integration cases pass.
- `pnpm build`: optimized build passes; no new public research/source routes.
- Frozen synthetic Tavily JSON fixtures verify protocol parsing, generated-answer
  removal, duplicate/invalid URL handling and exact selected text. Fixtures model
  the documented response shape; they are not recordings of live relevance.
- Transport regressions cover invalid/overridden inputs, non-JSON/oversized/error
  bodies, exhausted deadlines, in-flight cancellation, late responses and
  non-cooperative requests/streams. No automatic retry is used.
- Gate regressions cover stale/malformed verdicts, unsafe titles/URLs/content,
  complete-result inspection before truncation, metadata-inclusive byte limits,
  surrogate-pair preservation and distinct evidence-role system instructions.
- Isolated Postgres tests cover canonical-query provenance, prior approval,
  version/revision checks, budget allocation, one-time claims, metadata-only
  denial, no-evidence behavior, hash/FK constraints, restricted RLS writes,
  whole-package rollback and late attempt/revision/deadline/cancellation changes.
- `pnpm test:retrieval:neon`: seven restricted-role tests pass, including four
  simultaneous claims, same-run persistence, cross-owner reads, query/evidence
  rejection, immutable excerpts and late attempt fencing. Providers are doubles.
- `pnpm test:admission:neon` / `pnpm test:input:neon`: six cases each pass after
  the additive migration and shared lock-helper extraction.
- `pnpm db:migrate` / `pnpm db:verify`: migration 0005 applied to dedicated
  development Neon; 17 tables, verified TLS and four evidence RLS policies.
  Narrow runtime privileges pass. `pnpm db:generate` reports no schema drift.
- `pnpm test:e2e` / `pnpm test:e2e:neon`: eight public and four authenticated
  desktop/mobile checks pass on the production build after the migration.
- Public/private performance scripts pass: measured maximum LCP 336 ms,
  CLS zero, with unchanged route JavaScript transfer sizes. This is a local
  synthetic workload, not a deployed latency guarantee.
- Configured-secret scan: zero matches across 164 tracked/candidate files and
  524 history objects before the final commit. Synthetic admission identities
  and isolated operator-budget cleanup checks both report zero remaining rows.
- The production dependency audit passes the high-severity gate. No dependency
  was added; the previously documented moderate advisory remains.

## Remaining release gates

The browser regression suite exercises existing conversation/session UI, not a
live retrieval interface. T11 will compose the guarded pipeline and verify its
actual HTTP bytes. There is no test-only retrieval endpoint or guard bypass.

Before any live rollout, evaluate actual Tavily relevance, Hindi/multilingual
queries, source diversity/freshness and the configured evidence classifier's
false-positive/negative rates. Run a spending-capped smoke test with the actual
privacy/spend controls assigned to the application credentials. None of these
quality claims can be inferred from provider doubles.

T08 consumes the private package; T09 must validate final source metadata,
citations, links and answer safety; T10 must account for all provider attempts
and settle usage. T13 adds intent-preserving planning and safe follow-up context.
No public launch or production deployment is certified by this slice.
