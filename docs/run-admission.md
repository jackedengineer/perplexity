# T05 atomic admission contract

Scope: internal admission and budget reservations for signed-in FAST requests. No AI route, classifier, provider calls, automatic grants or successful-answer settlement is enabled by T05. Those remain later milestones. Changes are on `feat/run-admission`.

## Transaction contract

- Derive the application owner from a verified auth subject, then acquire a transaction-scoped owner advisory lock (without granting profile mutation rights). Lock the owned conversation before any replay. Missing/foreign resources share safe unavailability.
- Matching owner/intent retries compare a versioned HMAC using the stored key ID and original pricing/policy snapshot. Running or terminal duplicates never execute or reserve again. Changed payload reuse fails. Missing historical keys fail closed; retain keys as long as their intent records.
- New valid owned attempts consume bounded minute/day counters, including quota, revision and active-run denials. Committed run retries consume no additional attempts. Attempt ceilings use server policy; UTC timestamps represent Asia/Kolkata calendar-day windows.
- Check revision and one active run per owner/conversation. Lock applicable user PERIOD/DAY and operator PERIOD/DAY budgets in deterministic order. Missing or overlapping configuration fails closed.
- Reserve fixed customer answer credits independently from integer micro-USD provider exposure in all four budgets, insert one run/reservation and increment the conversation revision atomically. A failed admission leaves no run, reservation or partially held budget; attempt counters remain consumed on expected denials. Unexpected database errors roll back the transaction.
- Admission stores no raw question, locale, history or rejected content. Only the fingerprint, immutable policy/price/model identifiers, budget references, timestamps and safe state are retained. No external call occurs in a transaction.

## Persistence and lifecycle

`runs`, `usage_buckets`, `operator_usage_buckets`, `usage_reservations` and `admission_attempt_buckets` add explicit units, nonnegative/within-limit checks, unique intents, active-run partial indexes and composite owner foreign keys. Global operator budgets have a server-owned namespace so isolated live tests cannot affect an operational budget. User budgets have PERIOD/DAY kinds; operator budgets independently cap the same windows. Both budget dimensions must exist before admission. Budget creation/limits are privileged provisioning, never browser inputs or login grants.

The reservation is one record per run, covering both user windows and both operator windows. Expired deadlines do not silently release money or permit automatic paid replay: an unknown upstream outcome must remain held until reconciled. Success finalization, known-cost failure settlement, cancellation and stale-run recovery remain T10/T18–T19. This slice must not be exposed as a public submit endpoint before those paths and safety gates exist. Deletion of an active run likewise requires later fencing and budget reconciliation.

## Verification plan

1. Empty-database migrations: invalid ownership, negative/over-limit counters, duplicate intents/active runs, reservation ownership and snapshot constraints.
2. Unit: canonical HMAC/version rotation, trusted configuration, UTC/IST boundaries and bounded UTF-8 HTTP input parsing.
3. Database admission: identical retries, changed payload, foreign IDs, stale revisions, active runs, missing/overlapping/exhausted budgets, rollback, unchanged raw-content tables and duplicate behavior across periods/policy updates.
4. Real Neon connections: synchronized identical/different intent races and different users competing for a shared operator budget, plus restricted-role verification. No provider calls or real customer data.
5. Full lint/types/tests/build and regression checks; secret scan and feature-branch push/PR. Generated migration snapshots are mechanical exceptions to the requested 400–700-line focused commits.

## Configuration and internal boundary

`src/server/runs/service.ts` is the server-only integration point. It uses the existing database-backed application session, checks exact origin and JSON media type, reads at most 16,384 actual bytes with a five-second body deadline, then invokes admission. Unknown/oversized fields and invalid UTF-8 fail before a transaction starts. There is intentionally no route or UI action pointing at this service yet.

`RUN_HMAC_ACTIVE_KEY_ID` selects a key in `RUN_HMAC_KEYS_JSON`, a JSON object of key IDs to independent 64-character lowercase hex secrets (32 random bytes each). Neither has a fallback. The configuration supports at most eight retained keys and redacts configuration errors. Missing historical keys fail closed even for an existing intent; retain each key while its runs remain retryable. Keep the keyring in the server secret store, separate from the Better Auth secret, never in `NEXT_PUBLIC_*`. Live tests inject ephemeral in-memory keys and do not change `.env.local`.

The initial trusted FAST envelope is five answer credits and 50,000 micro-USD ($0.05) reserved provider exposure, three new attempts per minute, 20 per Asia/Kolkata day, one active run per owner and a 45-second run deadline. This is a conservative versioned reservation ceiling, not an observed provider price or a product entitlement grant. Model evaluation/pricing and free/paid grants remain T30–T35. Missing all user funding returns `BUDGET_EXCEEDED`; incomplete, overlapping or inconsistent funding returns `CONFIGURATION_UNAVAILABLE`. Every request needs exactly one active user PERIOD/DAY pair with the same entitlement version and one active operator PERIOD/DAY pair in the trusted namespace. Provisioning defines the precise period/day boundaries; admission never guesses a billing period or creates a fresh allowance.

The configured origin and authenticated subject cannot come from the request body. The factory accepts these only through internal dependencies for testing; public inputs remain the T02 strict submission schema. `admitRequest` returns a request ID plus a minimal run reference or fixed denial code. A future HTTP adapter must use `createPublicError`, private/no-store responses and those same ownership boundaries. Database exceptions are mapped to a fixed unavailable code without serializing SQL parameters.

| Result | Meaning |
| --- | --- |
| `ADMITTED` | One run and reservation committed; revision advanced once |
| `RUN_IN_PROGRESS` with run reference | Matching active intent; return the existing status |
| `RUN_ALREADY_FINISHED` with run reference | Matching terminal intent; recover existing result/status, never execute again |
| `IDEMPOTENCY_MISMATCH` | An owned intent was reused with changed text, revision, conversation or options |
| `CONFLICT` | New intent used a stale conversation revision |
| `RUN_IN_PROGRESS` denial | Another intent is active for this owner |
| `RATE_LIMITED` / `BUDGET_EXCEEDED` | New intent exceeds an attempt or funding ceiling |
| `NOT_FOUND` | Missing profile, missing conversation or foreign conversation |
| `CONFIGURATION_UNAVAILABLE` | Invalid trusted configuration, missing historical key or unexpected dependency error |

Attempt counters saturate at their ceiling; a minute denial may still increment the day counter and vice versa. Denied intents have no durable run key, so another submission of a denied intent counts again. They do not hold budget or persist a question. Invalid/unowned inputs and matching committed retries consume no new attempt. A late unexpected database failure rolls back counters too, because no trustworthy transaction result exists.

The owner advisory lock is transaction-scoped and compatible with Neon's transaction pooler. Conversation and budget row locks provide revision and shared-spend isolation across processes. A two-second lock timeout bounds contention; no transaction retry automatically replays an unknown committed outcome. The connection pool's existing ten-second statement timeout remains in effect. The safe retry is the same owned intent and original payload. Logs record only request ID, outcome and elapsed milliseconds, with no question, subject, fingerprint, budget amount, cookie or driver error.

## Verification evidence — 2026-10-22

- `pnpm check`: lint, strict TypeScript and 108 deterministic tests, including schema ownership/check constraints, savepoint rollback, terminal/expired retries, historical key rotation, changed-payload rejection, exact balances, separate credit/spend limits, missing/overlapping funding, IST day boundaries, slow/oversized/aborted input and redacted diagnostics.
- `pnpm build`: production build passes; its route manifest contains no submit/AI endpoint.
- `pnpm db:migrate`: reviewed additive `0003_atomic_run_admission` applied to the dedicated development project. Unique composite-FK targets are created before their referencing constraints. Deferred bucket FKs permit an auth-user cascade to remove its run/reservation/user-budget fixture consistently.
- `pnpm db:verify`: PostgreSQL 18, 13 expected tables, verified TLS on both URLs. Runtime admission/reserve rights pass; budget creation, limit changes, fingerprint changes, settlement, reservation mutation, message insertion and schema creation remain denied.
- `pnpm test:admission:neon`: six isolated real-Neon tests pass (about 17 seconds for the suite, including setup/cleanup; this is not a request latency percentile). Four simultaneous transactions first prove four distinct backend PIDs. Identical intent race: one admitted, three existing-run responses, one run/reservation, one increment per attempt window and one hold per bucket. Different-payload and different-conversation races do not create a second run. Two owners competing for the final operator allowance admit exactly one; the loser retains zero held credits and its original revision. A late operator-day denial rolls back user/period holds. Terminal replay survives a pricing change without increasing held amounts.
- `pnpm test:e2e`: eight public desktop/mobile regressions pass. `pnpm test:e2e:neon`: four live authenticated desktop/mobile regressions pass, including owner isolation, conversation persistence, session renewal and sign-out.
- `pnpm audit --prod --audit-level=high`: passes with the previously documented moderate transitive advisory; no new dependencies were introduced.
- `pnpm db:generate`: no schema drift. Configured-credential scan: zero matches across 129 tracked/candidate files and 400 Git history objects before the verification commit.

Final code review checked ownership before replay, immutable trusted snapshots, bounded input/queries, lock order, savepoint versus whole-transaction rollback, restricted grants and redacted diagnostic paths. The schema includes a mechanical 1,716-line Drizzle snapshot; the admission-service commit is 539 handwritten lines. Verification/configuration/docs form the final focused slice rather than adding filler to meet a minimum line count.

The live suite is excluded from default Vitest/CI, requires explicit opt-in through its command, uses the owner connection only for synthetic fixtures and performs every admission with `perplex_web`. Each fixture has unique captured user IDs and an independent operator namespace; cleanup never deletes an operational budget. No real user question, session, Google account, AI model or search provider is used.

## Rollback and remaining work

The schema is additive. Roll back application code while leaving these tables intact; do not drop active reservations or zero counters as a rollback shortcut. There are no public admission calls to disable in this milestone. Future execution must check run ownership, deadline and attempt fencing again before provider work and commit a terminal settlement through T10. Unknown costs remain reserved until reconciliation. No timeout reaper, cancellation refund, credit grant, approved-answer settlement or production deployment is claimed here. T04 preview verification remains open; T06 is the next implementation slice.

Design references: [Drizzle transactions and nested savepoints](https://orm.drizzle.team/docs/transactions), [PostgreSQL explicit locks](https://www.postgresql.org/docs/current/explicit-locking.html) and [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).
