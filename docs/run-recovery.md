# T18 recovery contract

Scope: owner cancellation/status, stale-run settlement and usage reconciliation.
Paid-model testing and production deployment remain pending. T12–T17 remain separate
features; T18 reuses the existing T11 owner/status and T10 settlement boundaries.

- Cancellation and expiration use the session → owner advisory lock → conversation
  → run → user buckets → operator buckets order. They increment the attempt fence,
  settle once, and never persist or release a private draft. Completed answers win
  or lose atomically against cancellation and remain recoverable after delivery loss.
- A periodic server monitor cooperatively aborts in-flight work when another process
  cancels/times out the run. Provider cancellation is best effort; a late charge is
  still recorded and generation is never resumed by recovery.
- A bounded authenticated cron sweep repairs expired active runs and unsuccessful
  terminal runs missing a settlement. Status polling opportunistically expires only
  the authenticated owner's requested run. A missing reservation or impossible
  accounting state is reported as a failure, never invented as a zero-cost refund.
- Original settlement receipts stay immutable. Append-only reconciliation entries
  debit newly known charges and release only verified unused holds in the original
  four buckets, including expired windows. Answer credits are not charged again.
- A late successful provider receipt can resolve a cost automatically. Ambiguous
  STARTED/UNKNOWN/null-cost calls require a privileged, immutable usage resolution
  with a SHA-256 evidence reference from an inspected provider receipt. No browser
  or cron request may submit a cost or manufacture such evidence. The maintenance
  CLI records these receipts using explicit database selection, not hosted owner
  credentials. Time passing alone never means not billed. Legacy accounting-v0
  holds and cap overages remain held for operator investigation.
- Overlapping sweeps, duplicate cancellation, repeated receipts and late completion
  are idempotent. Database clocks determine expiry; no provider/model is called by
  recovery. Responses and logs contain fixed states/counts, never drafts or evidence.

Vercel Hobby supports only daily cron invocations. A daily fallback plus owned
status recovery is the initial low-traffic configuration; it is not a promise of
minute-level unattended cleanup. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
and [cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
Configure a random `CRON_SECRET` before deploying; absent/invalid credentials fail
closed. Higher-frequency scheduling requires an explicitly chosen scheduler/plan.

Verification will cover killed handlers, late costs, missing/duplicate settlements,
owner/origin/session denial, cancellation/completion/reaper races, immutable receipts,
original-window balances, restricted grants and real browser recovery with synthetic
providers in the dedicated development database. No paid-provider calls are needed.

## Operator usage receipts

The job never calls a billing/provider API or guesses that a timed-out request was
free. Successful late `provider_calls` usage is reconciled automatically. For an
ambiguous call, inspect the provider billing receipt, retain that evidence in the
operator's private records, and write **metadata only** to an ignored JSON file:

```json
{"callId":"00000000-0000-4000-8000-000000000001","runId":"00000000-0000-4000-8000-000000000002","costMicroUsd":"300","kind":"PROVIDER_RECEIPT","evidenceHash":"<SHA-256 of the inspected receipt>"}
```

Use `VERIFIED_NOT_BILLED` with cost `"0"` only when provider evidence establishes
that no charge occurred. The hash is an audit reference, not automatic proof that
an invoice is correct. The command requires explicit operator attestation:

```sh
PERPLEX_DB_ENV_FILE=.env.launch.local \
PERPLEX_DB_EXPECTED_HOST=ep-small-bread-b3we4v54.c-4.ap-southeast-1.aws.neon.tech \
node scripts/record-usage-resolution.mjs --receipt .artifacts/usage-receipt.json --verified-receipt
```

This is a privileged write; never run it against a real charge using synthetic
metadata. It validates the terminal call/run association, frozen stage cap and
previously reported usage. Repeated identical receipts are harmless; conflicting
receipts are rejected rather than overwriting history. Runtime has SELECT only
on these resolutions and SELECT/INSERT on adjustment entries. Cron and browser
routes cannot insert receipts. Missing/inconsistent reservations, over-cap costs,
legacy accounting and contradictions after release require investigation; holds
are not silently cleared to unblock a customer.

After recording a receipt, invoke the authenticated recovery endpoint or await its
scheduled invocation. At most ten stale runs and ten actionable reconciliations
are selected; the job stops starting work after a shared 25-second budget and
retains the platform's 60-second maximum. Each run commits independently. Unknown
holds with no actionable evidence do not fill the reconciliation batch. Failed
records produce a fixed 503 and redacted count logs for operator investigation.
The configured daily expression is 02:00 UTC (07:30 Asia/Calcutta); Vercel Hobby
may invoke it within that hour. No hosted job is active until deployment.

Migration `0007_run_recovery.sql` is additive. It adds no owner credentials to
runtime. Apply it before deploying T18, then run the explicit-target verifier
(expected schema: 23 tables). Development has been migrated; production remains
at the prior 21-table checkpoint. Roll back application code without dropping
receipts, adjustments or held reservations. A later forward-compatible deploy
can resume recovery from these durable records.
