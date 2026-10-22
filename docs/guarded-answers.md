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
