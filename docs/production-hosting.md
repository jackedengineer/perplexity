# Production hosting and enablement checkpoint — 24 October 2026

The application is hosted at https://perplexity-gold-alpha.vercel.app. Production
AI verification failed, so the app was rolled back to the working deployment
with research unavailable and guest access disabled. This report supersedes the
initial hosting checkpoint; it does not close the public-launch gates in
`tasks/privacy-trials-release.md` or the evaluation protocol.

## Current deployment

- PR #12 is merged. Current source: `1228babb17ab02429c4598d8021c1766ad703383`.
- Current production deployment: `2B5mEhKqHhryWYunG5oovr6kKaHQ`, restored through
  Vercel's rollback UI after the AI-configured deployment failed live checks.
- Dashboard: https://vercel.com/chiragbhugras-projects/perplexity/2B5mEhKqHhryWYunG5oovr6kKaHQ
- The tested AI-configured deployment was `kP24trKbeo21ivTnUNt5mgnaCFrW`, built
  from the same source with fresh production settings. Its build succeeded.
- Vercel's rollback pauses automatic production promotion. A future release must
  deliberately undo the rollback/promote a verified deployment; a merge alone
  must not be assumed to update the live site.
- Next.js preset, Node 24, Fluid Compute, Hobby plan, Singapore (`sin1`). No paid
  upgrade was selected. Payments remain disabled.
- Production Neon uses the isolated `perplex` database with verified TLS and
  migrations 0000–0020. Runtime uses restricted `perplex_web`; the owner URL was
  never installed in Vercel. Existing row-security/ownership controls remain.

## Stored configuration versus active configuration

Vercel production settings contain the existing database, auth, HMAC, operator
budget, cron and guest-disable settings. This session added OpenRouter/Tavily
credentials and the following approved model configuration:

| Role | Model | Pinned provider |
| --- | --- | --- |
| Input/output safety | `mistralai/mistral-small-3.2-24b-instruct` | `deepinfra/fp8` |
| Planner | `mistralai/mistral-small-3.2-24b-instruct` | `deepinfra/fp8` |
| Default answer | `openai/gpt-4.1-mini` | `azure` |

The enabled economy catalog was `economy-nano,economy-mistral`. No provider
fallback, retry expansion or weaker guard was introduced.

The approved free **Perplex Production** Turnstile widget was created for only
`perplexity-gold-alpha.vercel.app`, in Managed mode with pre-clearance off. Its
site key and secret were saved to ignored maintenance configuration and Vercel
production settings. A copied-value formatting error was corrected before the
final verification: Siteverify now rejects an invalid token with
`invalid-input-response`, rather than `invalid-input-secret`.

These saved AI/Turnstile settings are **not active in the current rollback
build**. Turnstile was saved after the AI deployment and has not been exercised
in a hosted challenge. `ENABLE_GUEST_TRIALS=false` remains set. Secret values are
not committed, and production secrets were not added to preview environments.

## Bounded live AI verification: zero of three answers completed

Three owner-authenticated browser requests used the economy selector. All failed
closed before retrieval, so Tavily retrieval, answer generation and citations
were not reached.

| Query | Observed result |
| --- | --- |
| What causes a rainbow? Give a short explanation with reliable sources. | Input safety passed. Planner returned a completed, billed response upstream, but the application rejected it. The exact validation failure is not established. |
| What causes a rainbow? | Input safety passed. Planning reached its approximately five-second deadline. No completed provider receipt was available. |
| What is a rainbow? | Input safety failed. OpenRouter upstream logs confirm DeepInfra HTTP 429. |

The UI displayed a recoverable research-unavailable error instead of exposing an
unapproved answer. For the first sample, telemetry recorded first progress at
2,218 ms, admission at 263 ms, execution at 4,571 ms and planning at 2,290 ms.
These are failed-run timings, not successful-answer latency acceptance.

No more paid requests were issued after the three failures. The unchanged
OpenRouter key has a non-resetting **$1 limit**, expires October 29 at 18:12 UTC,
and reported total usage **$0.1374114**, leaving **$0.8625886**. This session's
increment was **$0.00017685**.

The `production-gated` DAY and PERIOD budgets each limit the same spend to $0.15;
they are not additive allowances. Both expired October 24 at 09:27:34 UTC
(14:57:34 IST). They were not renewed or reset. Remaining uncertainty holds stay
reserved, rather than being treated as free spend.

## Usage reconciliation and recovery

A real OpenRouter generation receipt matched the first planner call by creation
time, model/provider and native token counts (510 input, 119 output). Its cost
was $0.00006205, conservatively rounded to 63 micro-USD, matching the existing
recorded cost. The receipt was recorded using the existing verified-receipt CLI
against the explicitly selected production database.

- First receipt insertion succeeded; repeating it returned a duplicate result.
- The authenticated hosted recovery endpoint reconciled exactly one run.
- Repeating the sweep reconciled zero additional runs.
- The append-only adjustment released $0.049879 of the first run's uncertainty
  hold without charging the user again or mutating its original settlement.
- Each operator budget now records 179 micro-USD settled and 99,942 micro-USD
  still held for the other two unresolved calls. Holds are not actual spend.

The recovery endpoint and reconciliation path were exercised. There were no
active stale runs in these sweeps, so actual stale-run repair remains untested
in production. The daily 02:00 UTC cron trigger has not yet been observed.

## Restore, rollback and browser checks

A separate Neon point-in-time branch, `restore-drill-20261024`, was created from
October 24 at 14:50 UTC. Read-only checks matched production and restored data:
21 migrations, one user, three conversations, two messages, three runs, three
settlements, four RLS-enabled tables and identical run/settlement digests. The
branch is configured to expire October 25 at 14:57:18 UTC. Production was not
overwritten, and the live app was not switched to the restored database.

Vercel rollback was actually executed. After rollback, browser sign-out and
Google sign-in succeeded; the private workspace displayed its 40-credit balance
and disabled research composer. Guest entry was absent, and the inspected
browser console had no warning/error entries.

A bounded HTTP smoke check made ten requests per endpoint at concurrency two:

| Endpoint | Status | p50 | p95 |
| --- | --- | --- | --- |
| `/` | All 200 | 36 ms | 233 ms |
| `/api/auth/get-session` | All 200 | 123 ms | 244 ms |

These small samples do not establish load capacity, frontend Core Web Vitals or
AI response performance. Earlier release validation included lint/types/build,
634 offline tests, restricted Neon tests and desktop/mobile coverage; those
checks were not rerun for this documentation-only checkpoint.

## Remaining public-launch gates

1. Fix the provider availability/planner failures and the eight deferred PR #11
   findings. Repeat current-version quality/safety evaluation and successful
   hosted answers, citations, progress delivery, cancellation and reconciliation
   within an explicitly bounded verification window. Preserve the $1 key cap.
2. Deploy Turnstile configuration with guests still disabled, verify valid,
   expired/replayed and wrong-host/action challenges, then verify guest quotas
   and guest-to-Google history transfer before enabling guest access.
3. Complete Google branding and public audience requirements. The current OAuth
   project remains External / Testing with one test user; publishing is blocked
   by incomplete branding. Homepage/privacy/terms links are empty and the app
   has no privacy/terms routes. The production client callback is correct, but
   successful owner sign-in does not establish public sign-in eligibility.
4. Complete hosted cross-user, deletion/export, stale-run repair, scheduled cron,
   alerting, application restore and successful AI latency checks. The database
   restore and Vercel rollback checks above cover only their stated scope.
5. Revisit Razorpay onboarding, test checkout/webhooks and paid-tier activation
   after the hosted research and public-access gates pass.

Do not renew budgets, release unknown usage holds, expand OAuth audience, enable
public guests or resume automatic production promotion merely because hosting
and the build are healthy.

## Local evidence

Ignored `.artifacts/` files retain verification details:
`production-ai-run-results.json`, `production-first-run-logs.txt`,
`production-openrouter-upstream.txt`, `production-recovery-cap-verified.json`,
`production-turnstile-invalid-token.json`, `production-planner-provider-receipt.json`,
`production-reconciliation-verified.json`, `production-restore-drill.json`,
`production-bounded-http-latency.json`, `production-rollback-dashboard.txt` and
`production-rollback-workspace.png`. Credentials and raw maintenance environment
files must remain ignored; only this redacted checkpoint is committed.
