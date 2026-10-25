# Canonical production entry — 25 October 2026

Share **https://perplexity-gold-alpha.vercel.app/** with users. Google OAuth,
Better Auth and the production Turnstile widget are configured for that origin.
Generated deployment URLs identify individual builds; they are not public app links.

## Retired URL repair

The `perplexity-ntsfg4nlo-chiragbhugras-projects.vercel.app/sign-in` page failed
during server rendering before Google sign-in began. The canonical site's sign-out
and Google sign-in completed successfully in the real browser. The precise old
build configuration failure was not established; no auth permissions were broadened.

Vercel project routing rule `848a67f4-b75b-4e09-a03d-399c9d966f3c` is published
under **CDN → Routing Rules**, named **Redirect retired deployment to production**.
Its exported route is versioned in `ops/retired-deployment-route.json`.
This is an operational manifest, **not automatically applied by Git or Vercel builds**.
Do not put it in the app's Next.js routing: a new build cannot repair an immutable
old deployment. Project rules run before the old deployment's application routes.

- Anchored, escaped Host match covers only the retired hostname.
- Every path returns 302 with the canonical homepage as its fixed Location.
- The original path is discarded. Stale OAuth `code` and `state` parameters are
  explicitly deleted; Vercel otherwise inherits query parameters, even with a
  fixed Location header. Other query parameters may remain.
- Canonical production, localhost and protected previews do not match the rule.
- No Google client, trusted origin, cookie, Turnstile or AI budget was changed.

Vercel deployment protection runs **before** these routing rules. After explicit
user approval, an exception was applied only to the retired hostname. All six
unauthenticated probes now pass: visitors reach production without Vercel SSO.
Standard Protection remains enabled, and the existing research preview still
redirects unauthenticated visitors to Vercel SSO. Do not disable project-wide
protection or distribute a protection-bypass secret as a public link.

## Verification and rollback

Run `node scripts/verify-production-entry.mjs` for six bounded, unauthenticated
GET checks. It reports Vercel protection as failure, never as a passing redirect.
It checks the retired root, sign-in, library and a synthetic OAuth callback,
plus the public production homepage and sign-in page. It does not call AI APIs,
read secrets, authenticate users or change data. Browser verification is still
required for the Google round trip; HTTP 200 alone does not establish sign-in.

Verification completed: old sign-in → canonical homepage → Google sign-in →
authenticated workspace; synthetic old callback code/state → clean homepage.
Three manifest scope checks, focused ESLint and project type checks pass. No application code
changed; build and full research tests were not rerun. Production currently shows
Ready on source `6ed8762` (PR #13 merged).

Before disabling/removing this rule, **restore protection on the retired host**;
otherwise its old application becomes reachable again. Route history supports
rollback, but a previous revision may forward query parameters. Restore the
versioned rule and verify it rather than choosing an arbitrary historical revision.

References: [project routing](https://vercel.com/docs/routing/project-routing-rules),
[generated deployment URLs](https://vercel.com/docs/deployments/generated-urls).
