# Guest access and free credits

Implemented for the free-only release. Razorpay checkout, paid plans, Premium
models and paid grants remain disabled, per the October 24 scope update. This
page describes the shipped configuration; the larger pricing document remains a
proposal for later billing work.

## Identity and quotas

Better Auth anonymous sessions use the same database-backed, HttpOnly cookie
session as Google users: seven-day rolling validity, renewal eligibility after
24 hours, and a separately enforced 30-day absolute lifetime. Provider OAuth
credentials are not application access tokens. Losing the session can lose
access to anonymous history; sign in before that happens.

A signed, HttpOnly `perplex_trial` cookie lasts 30 days. Only its HMAC and anonymous
subject are stored in the quota table. Signing out does not remove the trial
marker or issue another grant. Cookie clearing is not a strong identity boundary:
the server also limits guest creation globally (10/minute, 100/day), by HMAC of a
trusted edge IP (1/minute, 3/day), and by independent operator monetary budgets.
Vercel's overwritten `x-vercel-forwarded-for` is the only public IP authority.
Other public hosts fail closed. Loopback development has a shared local bucket.
Shared IPs may be rate limited; users can choose Google sign-in instead.

| Account | Answer credits | Daily limit | New attempts | Available answers |
| --- | --- | --- | --- | --- |
| Guest | Six once, expires after 30 days | Three successful answers | 1/minute, 3/day | Economy only |
| Verified Free | 40 per Kolkata calendar month | Five successful answers and 20 credits | 3/minute, 20/day | Economy and Standard |

There is one active run per owner. Registration carries spent guest credits into
the current free month/day instead of minting a second welcome allowance. Monthly
grants are unique per account and period. Existing operator-issued development
grants remain authoritative until their windows expire; automatic grants never
reset their spending or overlap them. Inconsistent overlapping windows fail
closed and require operator investigation.

## Models and money

| Public key | Answer model / pinned provider | Credits | Output token limit |
| --- | --- | --- | --- |
| `economy-nano` | GPT-4.1 nano / Azure | 2 | 600 |
| `economy-mistral` | Mistral Small 3.2 / DeepInfra fp8 | 2 | 600 |
| `fast-default` | GPT-4.1 mini / Azure | 5 | 1,200 |

The browser sends only the public key. Submission independently checks the
current identity, catalog and configured providers. Raw upstream IDs, prices,
tiers and safety overrides are not accepted. New snapshots record `trials-v1`
and `credits-v1`; historical snapshots stay replayable. There is no automatic
provider fallback. Internal planner and safety roles are not user-selectable.

Economy uses one planned web query and skips optional page extraction. Every tier
still passes the input, query, evidence, citation and output gates. The current
planner itself produces at most one query; Standard retains optional extraction.
A failed/blocked/clarifying/no-evidence result releases answer credits. An approved
recoverable answer charges once, even if delivery disconnects. Database triggers
append reservation/charge/release ledger entries; the runtime cannot mint grants,
change limits or insert/update ledger entries directly.

Customer credits are **not dollars**. All models conservatively retain the
existing $0.05 provider reservation until settlement/reconciliation; the proposed
$0.02 Economy envelope has not replaced that proven budget. Fixed free monetary
windows are $0.15 for the guest lifetime/day and $1/month, $0.25/day for registered
accounts, further constrained by the independently provisioned operator ceiling.
Unknown receipts keep money reserved. These limits are reservation ceilings, not
observed cost estimates or promises that every request will be available.

## Account linking and retention

The anonymous plugin callback uses sorted transaction-scoped owner locks. It
fences active guest runs, transfers private conversations/run ownership and usage
attribution, preserves historical receipts/buckets, carries attempt counters,
and revokes old guest sessions. Repeating the same link is idempotent; linking to
another account fails. Guest deletion in the plugin is disabled to avoid deleting
financial receipts. A conflicting owner intent UUID rolls the transaction back;
no content is partially transferred.

A late provider result from the old guest subject cannot resume content writes
under the new owner. Its unknown financial hold remains conservative until
operator reconciliation; linking never releases it speculatively.

Unlinked guest conversations are tombstoned and purged after 30 days by the
bounded recovery sweep. Linked history follows registered ownership. Trial-abuse
markers and non-content financial records survive content deletion. Excerpts and
safety/planning records have the separate TTL rules in [privacy controls](privacy-controls.md).

## Enablement and verification

Defaults in `.env.example` keep guests and Economy entries disabled. For local
development, set `ENABLE_GUEST_TRIALS=true` and
`ENABLED_ANSWER_MODELS=economy-nano,economy-mistral` after configuring evaluated
OpenRouter roles, Tavily, HMAC keys and valid operator windows. The APIs return
private/no-store usage and eligible models. No payment credentials are needed.
Apply migrations 0017–0020 with the owner; runtime uses the restricted role.
Migration 0019 deliberately defers ownership snapshot foreign keys so linking
can transfer them atomically; preserve the reviewed SQL when generating changes.

Public origins additionally require `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY`. Without both, the sign-in page hides guest entry; the
server rejects missing verification before creating an anonymous identity.
Turnstile tokens are verified against the configured hostname and `guest_trial`
action, with a five-second deadline and bounded response. Expired/replayed tokens
are rejected by Cloudflare. Tokens, secrets and raw IPs are not logged or sent to
the AI providers. Only configured loopback origins permit development without
challenge credentials. Real hosted challenge verification remains pending.
See [Cloudflare server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

Verification includes fixed grants, replay/concurrency, linked spend, expired
trials, restricted-role Neon admission/linking, desktop/mobile guest journeys,
quota/model tampering and accessibility. A live three-model smoke sample passed
citation/output validation with all eleven requests returning HTTP 200. This is
smoke evidence, not a full safety or answer-quality certification.

The October 24 live browser check also completed one Tavily-backed Economy answer,
rendered three citations and five source entries, persisted across reload, and
charged exactly two credits. OpenRouter usage afterward was $0.13723455 of the
unchanged, non-resetting $1 key cap (about $0.00181 spent during this verification).
Cold development timings were 7.2 seconds to progress and 37.5 seconds to approved
answer delivery. These do not establish production latency acceptance. Unknown
Tavily monetary receipts retained their conservative budget hold.

Public anonymous release is still gated on the deferred PR11 safety findings,
verified bot-challenge configuration, broader current-version quality evaluation,
and T23–T24 hosted recovery/restore/load checks. Google linking is exercised at
the plugin/service boundary; a real provider callback with an anonymous browser
session still needs hosted end-to-end verification. Razorpay onboarding and its
sandbox/webhook tests follow once the website is hosted.
