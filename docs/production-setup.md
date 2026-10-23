# Production setup and verification

Setup date: 22 October 2026. Application revision: `5157f88` (merged T11).
**Public launch remains on hold.** The initial setup left paid testing pending. On
23 October the seller funded OpenRouter and authorized live testing. The live
samples are recorded in [OpenRouter verification](openrouter-live-verification.md).
The repaired candidate passes all 72 semantic and 13 answer/citation cases, but
independent human review, clarification handling and operational gates remain
pending. No Vercel deployment was created. See [release checks](release-checklist.md).

## Created resources

| Resource | Configuration | Verification |
| --- | --- | --- |
| OpenRouter | Dedicated `Perplex production launch` key; $1 total, non-resetting limit; expires 29 October 2026 | Initial setup verified limit/expiration and an unfunded balance. On 23 October the funded browser balance was $4.99; a subsequently observed $2 key limit was restored to $1. Live verification is recorded below. |
| Tavily | Dedicated `Perplex launch verification` development key; 25 credits/month; pay-as-you-go left off | Edit dialog confirms the cap. One real basic search passes the existing application adapter. |
| Neon | Separate `perplex-production` free project; `weathered-lab-26287676`; Singapore AWS; Postgres 18.6; database `perplex`; default branch `production` | Seven reviewed migrations applied; all 21 expected tables and runtime permissions verified over authenticated TLS. |
| Application secrets | Independent production auth secret and versioned intent-HMAC key; operator namespace `research-production` | Generated locally; development values were not reused. No user/operator allowance was provisioned. |

Neon's optional managed auth, storage, functions, gateway and realtime services
were left disabled. The app continues to use its own Better Auth integration.

The runtime URL uses the pooled endpoint and a SQL-created `perplex_web` role.
The direct `perplex_owner` URL is for privileged maintenance only. Both require
`sslmode=verify-full`. Runtime checks confirm RLS for messages/evidence, reviewed
question/answer insertion policies, immutable review/settlement records, restricted
accounting updates, and no schema creation, budget grants or budget-limit changes.
Production has zero users, conversations, runs, user buckets and operator buckets.
Development fixtures were not run against production.

## Credentials and environment isolation

Credentials are in ignored `.env.launch.local` with file mode `0600`. The deliberate
nonstandard filename prevents Next.js from automatically loading these production
credentials into local development or a normal local production build. Existing
development configuration remains in `.env.local`. See the installed Next.js
environment guide and [documented load order](https://nextjs.org/docs/app/guides/environment-variables#environment-variable-load-order).

The original setup used Node `--env-file`. PR review identified that inherited
variables could override it. The corrected commands below read only the explicit
file, require both database URLs, validate the exact expected production host,
roles, database and TLS mode, and never fall back to development:

```sh
PERPLEX_DB_ENV_FILE=.env.launch.local \
PERPLEX_DB_EXPECTED_HOST=ep-small-bread-b3we4v54.c-4.ap-southeast-1.aws.neon.tech \
node node_modules/drizzle-kit/bin.cjs migrate
PERPLEX_DB_ENV_FILE=.env.launch.local \
PERPLEX_DB_EXPECTED_HOST=ep-small-bread-b3we4v54.c-4.ap-southeast-1.aws.neon.tech \
node scripts/verify-db.mjs
```

The existing runtime-role script is development-specific: **do not run it unchanged
for production**, because it reads and writes `.env.local`. Production provisioning
used the same reviewed grants in an ignored, exact-production-host-checked copy
with its file operations pointed at `.env.launch.local`.

During verification, Neon's accessibility output unexpectedly contained the owner
credential after the visible connection field was masked. The owner password was
immediately replaced using SQL and a fresh connection verified. The runtime
password was unaffected. The replacement owner URL is saved only in the ignored
maintenance file. Future browser observations must suppress raw connection-dialog
output even when the visible field appears masked. No credential value belongs in
this record or in build/CI logs. Neon documents [SQL role management and password
rotation](https://neon.com/docs/manage/roles#reset-a-password).

Vercel has received no secrets. When deployment is ready, install only server-side
runtime settings. Never upload `DATABASE_URL_DIRECT` or an entire maintenance env
file. Google credentials and the confirmed `BETTER_AUTH_URL` remain absent. Candidate
model/provider assignments were configured on 23 October; live quality approval
remains pending. See [the measured verification](openrouter-live-verification.md). Do not guess
these values or weaken the existing ZDR, no-fallback, structured-output or price
requirements to make a provider call succeed.

## Live evidence and limits

One fixed, non-sensitive operator query about MDN's `ReadableStream` documentation
was sent through `createTavilySearch`, using the new capped key and the app's
existing eight-second timeout and protocol validation. Result: **1/1 passed**,
five results, all from `developer.mozilla.org`, one reported search credit,
4,183 ms wall time. No generated Tavily answer was requested or released.
This is transport/integration evidence, not a relevance benchmark or an approved
end-to-end answer. The ignored report is
`.artifacts/launch-setup/tavily-live.json`.

Tavily's Production key choice was disabled on this account. The created key is
explicitly a development key. Its documented limit is 100 requests/minute;
[Tavily distinguishes it from the production environment](https://help.tavily.com/articles/3240802908-rate-limits).
Do not describe this account as production-enabled or activate a paid plan without
a separate decision.

The actual local browser submission shows the fixed “Research is not available
right now” state with no answer or sources released. At initial setup, paid quality, safety, answer latency and live research were
unverified. The 23 October [live sample](openrouter-live-verification.md) now
records actual provider and browser evidence; public-launch acceptance remains
**pending**, including independent human quality review. Existing
provider-double browser/performance evidence remains in [the T11 launch review](launch-review.md).
Local evidence screenshots are in ignored `.artifacts/launch-setup/`; they are not
public artifacts and must be inspected for credentials before any sharing.

## Pending OAuth and deployment

The Vercel import form is prepared for `jackedengineer/perplexity`, branch `main`,
project name `perplexity-jackedengineer`, Next.js preset, existing Hobby team.
`vercel.json` already pins functions to Singapore (`sin1`). The proposed hostname
`perplexity-jackedengineer.vercel.app` is **not reserved or assigned**.

Google's separate `Perplex Production` web-client form is prepared, not submitted,
in the existing Cloud project. Proposed HTTPS origin:
`https://perplexity-jackedengineer.vercel.app`; proposed callback:
`https://perplexity-jackedengineer.vercel.app/api/auth/callback/google`.
Confirm the assigned hostname before creating the client. The local-development
client remains unchanged. The existing Google project is **External / Testing**
with one test user. Its Publish app button is disabled and directs the operator to
complete Branding. The branding page still uses `Perplex Development`; home page,
privacy-policy URL, terms URL and authorised domains are empty. None was changed
or invented during setup. Resolve production branding/audience in the intended
Cloud project before treating sign-in as available to the public. Callback,
secure cookies, session revocation and cross-user isolation still require hosted
verification.

Resume in this order:

1. Keep the approved $1 key cap and auto-top-up off. Funding and the first live
   sample are complete; resolve the recorded failures before enabling public
   research. Replace/renew the key if its seven-day validity has elapsed, and
   provision only intended test user/operator allowances.
2. Run bounded live input/query/evidence/output safety and answer/citation cases;
   record costs, latency, denominators and failure behavior. An API key existing
   does not establish model suitability or account funding.
3. Complete applicable T18–T24 release gates: stale-run/unknown-cost recovery,
   abuse controls, retention/deletion, CSP, monitoring and exercised restore,
   rollback and kill-switch procedures. Keep the canonical backlog open until
   each capability is implemented and verified.
4. Assign a stable Vercel hostname through the appropriate gated deployment flow,
   create the matching OAuth client, install runtime secrets, and verify hosted
   Google login/logout, ownership, secure cookies and guarded research behavior.
5. Promote publicly only after launch checks pass. A protected preview, if used,
   is a separate verification environment and does not satisfy the public-launch
   gate by itself.
