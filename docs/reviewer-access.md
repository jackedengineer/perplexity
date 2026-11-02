# Temporary Razorpay reviewer access

The owner explicitly authorized a one-account, seven-day application login for
Razorpay review on November 2, 2026. Google remains the ordinary sign-in method.
No password signup, password replacement/recovery or administrative role is
enabled. The public review account must contain synthetic review content only.

## Provision and enable

1. Run local auth/provisioning tests and the opt-in development Neon browser
   suite before making a production account. `LIVE_REVIEWER_NEON=1 pnpm exec
   playwright test --config playwright.reviewer.config.ts` requires the ignored
   `.env.reviewer.e2e.local` fixture configuration and the pinned development DB.
   The tests use synthetic credentials; provider keys and paid job flags are off.
2. Prepare a mode-0600, ignored operator input file containing
   `REVIEWER_LOGIN_CONFIG` and `REVIEWER_PASSWORD`. The JSON configuration has
   version 1, a fresh `reviewer-<uuid>` subject, exact email, exact application
   origin, UTC `issuedAt` and UTC `expiresAt` no more than seven days later.
   Neither actual field value belongs in Git, logs, a PR or a screenshot.
3. Select an explicit maintenance target using `PERPLEX_DB_ENV_FILE` and
   `PERPLEX_DB_EXPECTED_HOST` (direct Neon hostname), `REVIEWER_PROVISION_FILE`
   (private operator input) and `REVIEWER_EXPECTED_ORIGIN` (canonical site).
   `pnpm exec tsx scripts/provision-reviewer.ts` validates a dry run; add
   `--apply` to create the identity. The tool refuses any existing email/subject,
   including a case-insensitive collision; it never resets another user's login.
4. A single transaction inserts a fresh operator-attested test user and a native
   Better Auth credential account. The native salted scrypt hash is stored, never
   the password. `emailVerified` denotes the operator-provisioned application
   test identity, not verification of ownership of an external Gmail mailbox.
   The tool creates no Pro subscription, job period, budget increase or admin role.
5. Keep `.receipt` private. Install **only** its `REVIEWER_LOGIN_CONFIG` in the
   matching Vercel environment and rebuild the reviewed commit. The password is
   not a Vercel setting. Remove the temporary local plaintext input after verification.
   The public entry is `/reviewer-sign-in`; ordinary `/sign-in` shows a review
   link only during an active configured window.

## Boundaries

- The exact email **and** operator-created user ID must match. The configured
  issuance time must equal the account's saved creation time, so replacing config
  cannot extend the same identity past seven days. Mismatched origins fail closed.
- Native password verification, same-origin/CSRF checks, database rate limits
  (five attempts per trusted-edge IP per minute), HttpOnly cookies and database
  sessions remain in force. Session creation and rolling renewal cap their expiry.
- Application session validation rejects reserved reviewer IDs when configuration
  is absent, wrong or expired, and revokes the affected session. An existing
  cookie or edited DB expiry cannot bypass application-window validation.
- Password registration/reset/change are closed. Reviewer user/profile mutation
  and social account linking are denied; implicit account linking is disabled.
  Guest conversation history is not transferred into the shared review account.
- Normal conversation ownership, verified-identity free allowances, provider
  admission budgets, the existing combined $2 cap and payment checks still apply.
  No real payment or AI request is needed to verify login, isolation or expiry.

## Revoke and clean up

Remove the Vercel reviewer configuration and redeploy to prevent new reviewer
sessions and application access. Revoke sessions for the exact captured subject
with the reviewed owner workflow for immediate cookie invalidation. Expiry is
also enforced automatically without a scheduled job or browser action.

Do not delete unrelated users, reset a quota namespace, or cascade financial
records. Remove temporary credential records and synthetic content through the
approved cleanup workflow after the review; content deletion/financial retention
are separate from ending authentication access.

Better Auth's [email/password API](https://better-auth.com/docs/authentication/email-password)
and [hooks](https://better-auth.com/docs/concepts/hooks), plus the installed pinned
1.7.12 implementation, are the basis for the integration. This does not turn a
local database password into a Google credential.
