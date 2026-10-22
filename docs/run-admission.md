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
