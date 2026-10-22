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
