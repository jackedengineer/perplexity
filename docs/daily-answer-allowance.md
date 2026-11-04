# Ten daily Chat/Web answers — 4 November 2026

Every eligible account, including an anonymous guest account, can complete ten
Chat/Web answers per IST calendar day. Paid Deep Research retains its independent
seven-report allowance. A failed or cancelled run does not consume an answer;
active work appears as reserved. Guest-to-Google linking carries completed answers
and spent credits forward, so signing in does not reset the counter.

Registered accounts receive 150 daily credits (ten times the catalog's maximum
15-credit price) and 4,650 monthly credits, sufficient for a 31-day month. Guests
retain economy-only models and receive 20 daily credits and 620 credits over their
existing 30-day trial, which can overlap 31 IST calendar days. The pending Qwen Max
model remains disabled; the larger credit allowance does not enable it.

Migration 0035 changes only user allowance floors and the bounded grant/link
constraints. Existing current/future eligible buckets receive the same floors,
including manual grants. Recorded spend, reservations, unknown-cost holds, original
grant receipts and window dates are preserved. New grants use the fixed v2 policy.
Per-account provider reservations have a $1/day and $31/period ceiling. These are
account eligibility limits, not funding: the shared operator ceilings and the
production OpenRouter key's $1 daily reset cap remain independently enforced.
Ten answers is a per-account allowance, not a guarantee of unlimited shared funding.

The composer displays the smaller of daily/monthly credits remaining and the daily
answer count. This fixes the misleading case where monthly credits remained but
the independent answer-count limit had already blocked admission.

## Verification

- 929 unit/integration tests, lint and types pass. Final focused tests also verify
  active reservations, cancelled/failed credit release and linking twenty guest
  credits after ten completed answers.
- The migration regression starts with the old policy, verifies the uplift and
  preservation of spend/holds/original grants/operator ceilings, and repeats it.
- Development Neon migration and restricted-runtime grant/admission/linking check
  passed. Runtime still cannot write credit limits or mint arbitrary grants.
- Cloudflare build and hosted results are recorded in the release checklist.

## Deployment and rollback

Apply migration 0035 through the exact-host owner workflow, then deploy the built
Worker with existing vars/secrets retained. No OpenRouter limit edit is required.
Previous production Worker: `21c3b141-38b2-4aac-b4d9-e75b24ccfacb`.
Rolling back the Worker restores the previous three/five-answer policy. Leave the
additive migration and accounting receipts intact; never lower a bucket below its
recorded usage or discard holds. Restoring older credit floors requires a separately
reviewed accounting change, not resetting counters.
