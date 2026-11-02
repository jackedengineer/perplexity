# Cloudflare job runner — November 2

The owner selected Cloudflare job execution after Trigger rejected account and
project-key deployments on both default and native build backends. No Trigger
upgrade, new provider allowance or security bypass is authorized by this change.
Keep the existing $2 verification ledger and the separately approved $5 pilot.

## Contract and ordered slices

1. Keep Postgres as the durable source of truth. A minute scheduled invocation
   claims at most one existing outbox entry, records delivery before execution,
   then uses the existing generation-fenced consumer. A crash between delivery
   and claim is repaired by the existing reaper. Never automatically repeat an
   uncertain billable step.
2. Create a fresh runtime-only database pool for each scheduled invocation and
   close it after all execution/settlement finishes. No global sockets, owner
   credentials, process.env mutation or public execution endpoint.
3. Use separate server-only JOB_OPENROUTER_API_KEY/JOB_TAVILY_API_KEY bindings for
   the paid pilot. Never fall back to the $2 ordinary-research key. Frozen model
   snapshots, the $0.200250 attempt ceiling, leases, cancellation and report grants
   stay enforced by the existing workflow.
4. Use one metadata-only KV activity marker, written before paid admission. The
   marker contains no question, report, email or owner ID. Its one-hour TTL covers
   the 15-minute job deadline. Minute cron skips Neon while idle; hourly recovery
   is an independent fallback. This avoids holding free Neon compute awake all
   month just to poll an empty queue. Failed wake-up prevents new admission.
5. Financial reconciliation, cleanup and deadline recovery remain available
   during an admission pause. Record readiness only from actual worker maintenance;
   new purchases also require configured dedicated keys and the funded window.
6. Verify crashes, concurrent cron, stale delivery, paused admission, no repeated
   paid effects and request ownership with database-backed regressions, then verify
   local workerd and hosted scheduling. Keep purchases off until hosted acceptance,
   merchant approval and the pending OpenRouter verification are complete.

Cloudflare scheduled work has a 15-minute wall-time limit; constrain this runner
with a 14-minute abort window, retaining the job's earlier absolute deadline.
The existing pipeline remains private until citation/output approval and atomic
persistence. Browser Tasks remain unavailable.
