# T02 boundary contracts and safety policy

Implemented 2026-10-22 on `feat/boundary-contracts`. Contract revision 1; safety policy `v1`. These modules define pure runtime schemas, immutable policy settings and fixed response selection. They do not implement a classifier, admission, provider calls, an AI endpoint, or answer approval/release.

## Trust boundaries and invariants

Browser submissions, planner output, retrieved content and safety-provider output are untrusted. A valid shape does not establish ownership, entitlement, provenance, semantic safety or factual support. Later orchestration must apply those checks independently. The main abuse cases covered here are forged authority fields, unbounded content, inconsistent plans, dangling source references, stale/malformed safety decisions and unsafe prose in public events/errors.

| Module | Contract |
| --- | --- |
| `src/server/contracts/chat.ts` | Strict newest-question submission; UUID intent/conversation IDs; revision 0–2,147,483,646; `FAST` and logical `fast-default` only; optional validated locale and IANA timezone hints |
| `src/server/contracts/pipeline.ts` | Discriminated clarify/answer plans, consistent bounded retrieval, normalized source registry and referentially valid passage package |
| `src/server/contracts/progress.ts` | Run ID/revision and four fixed public stage codes, without raw text or source metadata |
| `src/server/contracts/errors.ts` | Fixed HTTP status/code/message mapping and UUID request correlation; no raw exception/model messages |
| `src/server/safety/policy.ts` | Eleven versioned categories, four required checks, no classifier tools, strict verdicts and fail-closed normalization |
| `src/server/safety/responses.ts` | Static harmful-assistance/privacy/redaction/support/unavailable responses, selected independently of provider prose |

No new package, database migration, environment variable, provider configuration, network call or client import was added. Existing conversation/authentication routes retain their current behavior. `fast-default` is an application key, not an upstream model ID or an authorization grant. A missing provider mapping must remain unavailable until configured by the server in the provider integration.

## Submission and limits

The submission matches the system-design shape: `conversationId`, `clientRequestId`, `expectedRevision`, `message: {text}`, `mode`, `modelKey`, optional `locale`/`timezone`. Every object rejects unknown fields, including nested `message` role/approval fields. No browser history, owner, tool, tier, price, budget, policy version or safety flag is accepted. Intent keys must be stable across retries; their atomic enforcement and payload HMAC belong to T05.

- Original question text is preserved exactly, including whitespace, newlines, multilingual characters and emoji. Empty/blank text, lone surrogates and disallowed control characters are rejected.
- Maximum question length: 4,000 Unicode code points (combining marks count individually, not as one visual grapheme).
- The 16,384-byte HTTP cap is an exported constant. T05 must enforce it while reading bytes **before JSON parsing**; a schema over an already parsed object is not a body-size defense.
- Locale uses BCP 47 structural validation; timezone uses the Node ICU/IANA database, including recognized aliases. Numeric UTC offsets are rejected. Hints cannot control authorization or bypass freshness logic.
- Plans allow at most two 300-character search queries, 16 provenance-linked constraints, four disclosed assumptions and one clarification of at most 800 characters. Search/no-search and freshness/date fields must agree. Explicit constraint message IDs must later be verified against owned history in T12.
- Evidence allows ten sources, twenty passages of at most 4,000 characters each, and 32,000 passage characters total. IDs must be unique, passage references must resolve within the package, and hashes must have SHA-256 syntax. Hash authenticity, source ownership, deduplication and the separate 8,000-token context budget are T07 responsibilities.

The source registry stores URL/title/timestamps/rank once; passages reference it by server-issued `S1`–`S10`. This refines the denormalized illustrative `EvidencePassage` in the system design and prevents conflicting duplicate metadata within one source entry. Empty evidence is valid data, not permission to invent a sourced answer.

Source URLs require explicit HTTP(S) absolute syntax and a domain host, without malformed Unicode, whitespace, control characters, backslashes or embedded credentials. Raw checks run before URL parsing because the installed Zod parser strips tabs/newlines. Constructor failures become validation failures. This validates display syntax, **not** public-network egress, safe query parameters or a safe-to-fetch authorization. No direct URL fetcher exists; DNS/redirect/SSRF protections remain required if one is introduced.

## Versioned safety semantics

`guardVerdictSchema` requires the current literal policy version and exactly one variant:

- `ALLOW`: an explicitly empty category list.
- `BLOCK`: one or more unique, known category codes.
- `UNAVAILABLE`: an explicit boolean `retryable` hint, without content categories.

There are no verdict defaults. Unknown/stale versions, missing fields, contradictory categories, provider prose, plain strings (even JSON strings), and throwing provider objects normalize to current-policy `UNAVAILABLE` with `retryable: false`. The retryable hint never authorizes a new paid attempt or a run replay.

`resolveSafetyDecision` chooses only fixed application text. Response precedence is support → redact secret → protect private data → general refusal, independent of category ordering. For self-harm distress, `BLOCK` means stop ordinary research and offer supportive content; it does not mean show a punitive generic refusal. No helpline number is guessed or embedded.

An individual `ALLOW` is not an approved response or permission to skip another check. All four checks remain required: INPUT, OUTBOUND_QUERY, EVIDENCE and OUTPUT. The eventual classifier will be tool-free. Original input must be checked before any planner rewriting. High-confidence accidental credentials require deterministic handling before external classification. These execution gates remain T06/T07/T09 work.

Public stages are `SEARCHING`, `PREPARING_ANSWER`, `CHECKING_ANSWER`, and `SAVING_ANSWER`. Emit them only after input approval. Local preflight UI can show “Checking request.” T11 must bind these domain payloads to the installed AI SDK protocol; these schemas are not an SSE implementation. Do not serialize or log raw Zod errors, questions, evidence or provider objects in route error handlers.

## Fixtures and verification

`tests/fixtures/safety-v1.json` contains 32 synthetic labeled cases: 16 allow/block pairs covering every category and every required boundary. It includes English/Hindi, contextual follow-ups, accidental synthetic key material, retrieved-page injection and output privacy. No real credential or customer content is included. Pair labels deliberately distinguish education/defense/support from enabling harm; there is no keyword filter or allow-all provider stub.

These are seed expectations requiring maintainer review and future classifier evaluation. Tests prove valid labels, coverage, input preservation, fail-closed decision parsing and fixed response mapping. They do not measure semantic detection accuracy, multilingual quality, false-positive/negative rates or live end-to-end guard enforcement.

Verified:

- Focused tests were written failing before each behavioral slice, then made green.
- `pnpm check`: lint, strict TypeScript and all 79 unit/integration cases pass (33 pre-existing + 46 new).
- `pnpm build`: production build passes after each implementation slice.
- `pnpm test:e2e`: existing public desktop/mobile browser checks pass.
- A clean archive of `739fce8`, without `.env.local`, passed frozen/script-disabled installation, all 79 checks and a production build. The subsequent Unicode URL regression also passes the working-tree suite/build.
- The configured-credential scan found zero matches in tracked/candidate files. Built browser chunks contain none of the new contract/policy markers.
- No new contracts/policy modules are imported into the browser or existing runtime paths; UI and provider latency are unaffected by this slice.

Next: T05 implements real admission transactions, usage reservation, throttling and HTTP byte limits. T06 then connects a safety provider and proves blocked/unavailable verdicts produce zero planner/search/answer calls. Output approval and leak tests remain mandatory in T09–T11 before live answers can be exposed.
