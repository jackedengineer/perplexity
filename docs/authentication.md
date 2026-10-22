# Authentication and session lifecycle

Status: core Google/session foundation implemented, 2026-10-22. See [verification](foundation-verification.md). Anonymous identities, application UUID profiles, guest linking and sensitive account operations below remain planned.

## Decision

Use **Better Auth, its Drizzle adapter, Neon Postgres session storage, Google sign-in and the anonymous plugin**. Keep the browser and backend on the same origin. Better Auth supplies the authentication protocol; application code supplies conversation ownership, billing entitlements and usage admission.

Better Auth documents a cookie carrying a server-side session identifier, a Drizzle integration and a Next.js route adapter. Use the generated schema for the pinned stable version instead of hand-copying auth tables from a tutorial. ([Sessions](https://better-auth.com/docs/concepts/session-management), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Next.js integration](https://better-auth.com/docs/integrations/next))

This is a stateful opaque-session design. A session cookie is itself a bearer credential, but it is not a self-contained access JWT. Every protected request validates the session against the database and loads current application entitlements. There is no application access-token/refresh-token pair or custom refresh endpoint in the first web version.

## Expiry policy

The implemented core uses these session settings. Guest retention and sensitive-operation endpoints remain future work:

| Item | Setting | Enforcement |
| --- | --- | --- |
| Session validity window | 7 days | Better Auth `expiresIn`; expired rows do not authorize requests |
| Rolling renewal interval | 24 hours | Better Auth `updateAge`; eligible activity extends expiry to now + 7 days |
| Absolute session lifetime | 30 days from original creation | Additional server guard; renewal must never bypass this cutoff |
| Fresh sign-in for sensitive operations | Within 10 minutes | `freshAge` plus application checks for billing cancellation, account/security changes and deletion |
| Session cookie cache | Disabled | Database verification on protected routes; small traffic makes this inexpensive |
| Guest identity retention | Up to 30 days without linking | Application cleanup policy; session expiry does not itself grant new trial usage |
| OAuth callback/state lifetime | Auth-library controlled | Use the pinned library's secure defaults; do not reuse app-session TTLs for OAuth state |

The 30-day absolute limit is an additional application requirement, not an automatic consequence of `expiresIn`/`updateAge`. Check an immutable original issuance timestamp on every protected application request, revoke expired session records, and reject an old session even if a library refresh extended its `expiresAt`. Tests must cover that interaction before release.

Better Auth's rolling expiry update is **not a promise to rotate the session token every 24 hours**. Expiry/cookie renewal and credential rotation are different operations. A real sign-in or reauthentication establishes a new session; logout/revocation ends the old one. Do not add custom token-swapping code around the library.

If account security requirements later justify periodic token rotation, implement and test it using the pinned library's supported mechanisms, including concurrent tabs. It is not required to implement reliable server-side sessions here.

## What happens on a request

```text
Google sign-in completes through Better Auth
  → auth user/account and session are stored in Neon
  → browser receives a Secure HttpOnly session cookie
  → browser attaches the cookie to same-origin requests
  → server verifies session, absolute lifetime and account state
  → server loads application user, plan, model permissions and quotas
  → an eligible renewal updates database expiry and Set-Cookie
```

Use HTTPS, `HttpOnly`, `Secure`, `SameSite=Lax`, host-only scope and path `/`. Do not store session credentials in localStorage or expose them to React state/telemetry. Configure trusted origins and reject untrusted cross-origin mutations. SameSite is one defense; it does not replace auth-library CSRF/OAuth-state checks and application origin validation.

Mount Better Auth under `/api/auth/[...all]`. Perform session renewal through cookie-capable route handlers or the documented Next.js integration. A Server Component read cannot by itself set response cookies; do not silently rely on it to renew a session. Perform auth/renewal before an AI response stream begins, not after headers are sent.

Database-backed checks keep logout and revocation visible on the next protected request. Avoid shared caching of authenticated pages/responses. Check actual installed library behavior in tests; no cookie-cache stale window should be introduced accidentally.

On logout, revoke the server session, clear its cookie and request cancellation of active runs best-effort. Before releasing a long-running result, recheck session/account revocation and the run's authorization version. A provider call already in progress may still incur cost; record it internally without exposing a draft or charging a failed result to the user's answer-credit allowance.

## Google OAuth tokens versus app sessions

Google's identity flow may exchange provider tokens while signing in. Those tokens are for the identity-provider integration, not the credential the browser uses to call `/api/chat`. Request only the identity scopes needed for sign-in; there is no Google Drive/Gmail integration or offline Google API access in this scope.

Follow the pinned auth library's account-token handling and minimize retained provider data. Never put provider access/refresh tokens in the UI, billing claims or chat prompts. App-session expiry and any provider-token expiry are separate concerns.

Start with Google sign-in to avoid building password recovery or email delivery before the core product works. Add passkeys, email login, device/session management and account recovery only as explicit, tested follow-up capabilities. Require a verified registered identity for paid checkout and the registered free tier.

## Anonymous usage is still an owned server identity

The visitor does not need to see a sign-in screen. On first generation, establish a Better Auth anonymous session, mark the user `isAnonymous`, and issue the normal protected cookie. That guest can own private conversations and receive a small trial allowance. Presence of a session alone must never unlock the registered tier.

The anonymous plugin creates a user/session and supports an account-link callback. Linking application data is our responsibility; do not assume a plugin automatically migrates conversations or credit balances correctly. ([Anonymous plugin](https://better-auth.com/docs/plugins/anonymous))

Keep the existing application `users.id` as the stable UUID used by conversations/runs. Map its `auth_subject` to the Better Auth user ID. Add an application identity kind and account/link state; auth-library table IDs can retain the types generated by the selected version. This profile is application ownership data, not a second password/session system.

When a guest signs in:

1. Obtain the proven old anonymous and new registered identities from the auth flow, never a browser-supplied guest ID.
2. Fence/cancel any active guest run before moving ownership. Preserve completed conversation and evidence relationships in a transaction.
3. Link the application profiles/usage attribution idempotently. Preserve an identity-link audit record and already-consumed trial usage.
4. Grant the registered monthly free allowance once, subtracting attributable guest usage in the current free period; logging out and back in is not another signup grant.
5. Revoke the obsolete guest session and let the verified sign-in create the new session. Quarantine an incomplete migration; do not expose one user's data to another.

The plugin can delete the anonymous auth user on linking by default. Configure its documented deletion behavior so the application migration finishes safely, or retain the guest auth record until migration/reconciliation completes. Avoid an auth-table cascade that destroys application conversations before migration.

Browser storage can be cleared and IPs can be changed. Anonymous allowances are an abuse-cost control, not proof of a unique human. Combine guest-account limits, a trusted-edge IP-derived limiter, server-verified bot challenges, minimum account assurance for larger allowances, and a global free-spend ceiling. Avoid invasive device fingerprinting and avoid treating shared-network IPs as a reliable person identifier.

To keep ordinary auth-session expiry from automatically minting another guest trial, use a separate 30-day HttpOnly signed/opaque trial-budget handle. It identifies only a quota bucket, grants no conversation/account access, and must not be accepted as an authentication credential. A fresh anonymous session can be attributed to that existing budget when the handle is valid. Missing/cleared handles still require the IP/challenge/global-spend controls above; do not claim a browser-only mechanism can enforce one trial per human.

## If mobile clients or an independent API are added later

Reassess whether opaque mobile sessions or a proper OAuth/OIDC authorization server is appropriate. If access/refresh pairs are chosen then, a starting policy would be a 10-minute audience-scoped access token and a 30-day maximum refresh-token family with rotation on every refresh, hashed refresh-token storage, reuse detection and family revocation. These are future design parameters, not enabled features or defaults to claim Better Auth already implements for this app.

A rotating-refresh design also needs atomic consume-and-replace, a single-flight client refresh path across tabs/processes, a deliberate concurrent-refresh policy, safe credential storage per platform and exactly one replay of the original API request. Do not build this machinery merely to serve one same-origin browser application.

## Schema and verification additions

Generate Better Auth's user/session/account/verification tables and plugin fields using its version-matched CLI, then convert changes into reviewed Drizzle migrations. Keep session tokens and account data restricted to server repositories. Do not claim session tokens are hashed in storage unless the actual adapter does so; follow documented storage semantics and protect database access accordingly.

Application additions include `users.identity_kind`, link/migration state, immutable session issuance metadata if required for the absolute cap, and `identity_links` with unique source identity and verified destination ownership. Do not embed a paid-plan snapshot into the session credential; entitlement reads come from Postgres.

Required tests: valid/expired/revoked/absolute-expired sessions; renewal with correct `Set-Cookie`; cross-user access; guest versus registered entitlements; OAuth callback origin/state; sign-in fixation; guest-link retries and failures; revocation during an active run; and no cookies/provider credentials in logs or client bundles.
