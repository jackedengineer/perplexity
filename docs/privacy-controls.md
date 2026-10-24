# Conversation privacy controls

An owner can export a conversation as JSON or permanently delete it from the
conversation actions menu. Export contains approved visible messages and citation
links, not private drafts, model prompts, session data, or provider credentials.
Exports use one repeatable-read snapshot, bounded to 1,000 messages. Larger
conversations fail explicitly rather than returning a silently partial export.

Deletion serializes on the same owner/conversation locks as run admission and
completion. It settles active runs with zero answer credits, advances the attempt
fence, and increments the conversation revision. Messages, review payloads,
planning records, source URLs and evidence are removed in that transaction.
Repeated deletion is idempotent. Foreign and missing IDs return the same 404.
Creation replay cannot recreate or disclose a deleted conversation.

A content-free conversation tombstone and financial run/call/reservation snapshots
remain for idempotency, abuse control and accounting reconciliation. Calls already
in flight can still report their cost, but cannot save a late answer. Unknown
provider charges retain their reservation until reconciliation; deletion never
refills a quota or erases incurred costs. This is conversation deletion, not a
promise of account erasure or immediate removal from provider systems/backups.

The authenticated recovery cron also cleans expired evidence in batches of 100.
A retrieval's stored `expires_at` controls its evidence lifetime (currently 30
days). Only terminal runs are eligible. Expired excerpts and their normalized
citation-to-passage joins are removed; approved answer payloads preserve citation
URLs/titles and their original retrieval metadata. Factual support remains
NOT_CHECKED. Non-content safety reviews and private plans expire after 30 days;
approved output review payloads remain with their saved answers until deletion.
Cleanup failure is observable as a failing cron request, not silently skipped.

Neon backup retention and external provider retention are separate boundaries.
Restoring a backup requires replaying deletion records before exposing restored
content. Production launch must verify the actual backup window, provider data
policies, cron schedule and operational retention requirements. Do not advertise
immediate deletion from third-party systems.
