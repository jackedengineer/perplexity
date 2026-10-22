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
