# Research recovery and guest launch checkpoint — 24 October 2026

This checkpoint supersedes the active-state portions of
[production-hosting.md](production-hosting.md). Earlier failed samples remain
valid historical evidence. Research now completes for the signed-in test owner;
Google public sign-in is enabled; the hosted guest-flow checks now pass. The
owner approved and deployed the production guest switch; canonical guest smoke
and owner Google history transfer both pass.

## Delivered changes

- Planner v6 handles straightforward questions deterministically, preserves the
  original topic and requested format, and avoids treating ordinary `one-time`
  or electrical `current` wording as contextual or time-sensitive intent.
- Input safety validates complete bounded conversation history and the exact
  request byte budget before claiming a provider call. It fails closed when
  history exceeds six messages or 6,000 characters, rather than silently
  dropping older intent. This currently limits long conversations and surfaces
  the generic unavailable state; a dedicated continuation UX remains desirable.
- Answer input preserves the entire question and selects a ranked prefix of
  whole evidence passages within the transport budget before paid dispatch.
- Feedback reads share a serial queue, avoiding a per-answer burst against the
  small database pool.
- Safety prompts distinguish defensive discussion, external account intrusion
  and application prompt injection. Current versions are input-v9,
  evidence-v5, output-v8, answer-v9 and planner-v6.
- Cancellation refreshes the displayed credit balance after durable settlement,
  including saved-status recovery. It never grants an optimistic refund.
- `/privacy` and `/terms` use
  the requested name `perplexity` and `trainwithchirag@gmail.com`. They are
  approved by the owner and now published at their production URLs.

Migration 0021 adds planner-v6 to the database allowlist and has been applied to
development and production. Its generated Drizzle snapshot is the mechanical
exception to small focused commit sizes. No existing financial records changed.

## Active hosted configuration

Production source is `77b65955c9bb3bbc606d4b60103c3de32abf8667`, deployment
`H3iPd4cxC2qT5J29bL5FWMGVPeap`, redeployed through Vercel with the
`perplexity-gold-alpha.vercel.app` alias. CI verification and Vercel deployment
both succeeded for that source. The owner approved publishing the policies;
`/privacy` and `/terms` now return 200, display their effective date, and have no
draft banner. Their links work in the real browser with no observed console
warnings/errors. Public contact stays `trainwithchirag@gmail.com`; Google support
uses the separately approved `ichiragbhugra@gmail.com`.

Google branding is saved with app name `perplexity` and all three production URLs.
After explicit action-time approval, Google now reports External / **In production**.
Basic profile/email scopes are unchanged. The eligible support address is
`ichiragbhugra@gmail.com`; the policy contact remains `trainwithchirag@gmail.com`.

Protected guest staging ran on source `3b53401` in deployment
`5PH1cxFBEaWUtgyWZxXsQRuhCL64`, with the development database and distinct
Better Auth/HMAC secrets. Its 20 server settings were scoped only to
`codex/research-guest-launch`, not global Preview or Production. The exact branch
hostname was added to Turnstile and its callback to the existing development
OAuth client with owner approval. Turnstile remains Managed with pre-clearance
off. The preview retains Vercel authentication protection.

After the hosted checks below, the owner explicitly approved the production-only
`ENABLE_GUEST_TRIALS=true` change and redeployment. Deployment `H3iPd4cxC2qT5J29bL5FWMGVPeap` is Ready from the unchanged production
source `77b6595`. Canonical `/sign-in` returns 200 with the guest entry, and a
real Managed Turnstile verification created a production guest with six credits.
The canonical guest answer and owner Google linking smoke both pass. No access
gate or budget was bypassed.

| Role | Model | Pinned provider |
| --- | --- | --- |
| Input/evidence/output safety | Mistral Small 3.2 | `mistral/eu` |
| Model-backed planning | Mistral Small 3.2 | `deepinfra/fp8` |
| Standard answers | GPT-4.1 mini | `azure` |
| Enabled economy answers | GPT-4.1 nano | `azure` |

There are no automatic provider retries or fallback expansion. Production
Turnstile configuration is installed. Payments remain disabled.

The OpenRouter key retains its non-resetting **$1** cap and expires October 29
at 18:12 UTC. The October 24 18:32 UTC metadata observation reported
$0.170844500 used and $0.829155500 remaining. The cap and expiry were verified
again after testing. Provider cap metadata is not the same as the app's per-user
or operator reservation balance.

The `production-research-v1` DAY and PERIOD windows each bound the same spend
to $0.40; they are not additive. Both end October 25 at 15:34:44 UTC. Earlier
unknown-cost holds remain reserved. With explicit owner approval, only the test
owner's active DAY provider limit increased from $0.25 to $0.40. Every other
column, including settled spend and unknown holds, remained unchanged. Normal
plan defaults and the $1 PERIOD limit remain unchanged; no spend was reset.

## Verification and its limits

- Lint, TypeScript, production build and 646 offline tests pass. The later
  cancellation and policy changes also pass lint/types/build.
- Eight selected browser checks cover the local guest and research flows with
  mocked providers. Four additional desktop/mobile cancellation and stale-run
  recovery checks pass after reproducing the stale-balance failure first.
- The planning run observed 30/30 expected routes, 5/5 approved clarifications
  and 14/14 paired approved answers. Its final command failed the clean-tree
  assertion because Next regenerated `next-env.d.ts`; it is not an entirely
  green command. These plans were deterministic, not broad model-planner proof.
- A separate model-backed planner request completed through DeepInfra with
  HTTP 200. This does not establish ongoing provider availability.
- The original 72-case input-v9 safety sample produced 71 matching
  decisions, all required harmful stops/category routes and zero unavailable
  results. The benign `quoted-injection-allow` fixture was refused. The strict
  exact-match test therefore **failed**. Earlier failures remain preserved.
- One false refusal among 36 benign fixtures is below the protocol's measured
  5% threshold, but independent human labels, allowed-completion review,
  sampled claim support and judge calibration remain pending. Authored labels
  and small successful samples do not close those gates.

### Real hosted browser results

The question “What causes a rainbow? Give a short explanation with reliable
sources.” completed with four citations and five source entries. Progress was
visible, the source panel worked, the answer persisted across reload, and two
answer credits were charged exactly once. Admission-to-persistence was 9.418
seconds for this single sample; this is neither TTFT nor a production p95.

The following snowflake request was cancelled. The database recorded CANCELLED,
zero answer credits charged, no answer and known provider cost of 123 microUSD.
The answer run recorded 760 microUSD known cost. Unknown Tavily USD cost retained
49,240 and 49,877 microUSD respectively as conservative holds; those are not
claims of actual provider spend. No fabricated receipt released a hold.

Cancellation exposed a stale displayed-credit bug, now fixed and deployed.
After the approved test-owner allowance change, a real browser request for
“Why does snow look white?” was stopped. The display changed from 38 credits to
36 plus two reserved, then returned to 38 without a reload. Durable status was
CANCELLED, with zero answer credits charged and no answer/citations. Known cost
was 122 microUSD; 49,878 microUSD remains held conservatively for unknown cost.

A synthetic owner-scoped run exercised actual hosted stale-run recovery without
calling any provider. Its deadline was deliberately expired after real atomic
admission. The browser displayed the timeout state, retained 38 answer credits,
and the database recorded TIMED_OUT with the entire 50,000-microUSD reservation
released. There were zero provider calls, zero known cost and zero unknown holds
for this canary. The subsequent authenticated maintenance request returned HTTP
200 with zero pending records. This verifies manual invocation and idempotence,
not delivery of the scheduled cron trigger.

The export action displayed “Export downloaded”; the downloaded file contents
were not inspected. Unauthenticated export, private run status and maintenance
requests each returned 401 without saved answer content. This verifies signed-out
boundaries, not cross-user authorization. The inspected browser console had no
warning/error entries. Individual HTTP timings were 140–1,019 ms for these
protected endpoints; these are single observations, not latency percentiles.

### Hosted guest flow — protected preview

Real Turnstile verification accepted the hosted origin and created one guest.
An invalid synthetic token was rejected by the real Cloudflare endpoint and the
application verifier; this negative check did not exercise the full hosted route.
Three real guest answers (rainbow, blue sky, floating ice) completed with three
rendered citations each, five source entries, and two credits charged per run.
Admission-to-persistence durations were 10.617, 10.542 and 14.560 seconds. These
are three observations, not latency percentiles or TTFT measurements. Their
planner stages were deterministic SKIPPED, not model-backed planning samples.

The UI counted down 6 → 4 → 2 → 0 credits. A fourth request displayed the allowance
error; database inspection confirmed exactly three runs, with no fourth provider
execution. A synthetic foreign conversation returned the unavailable screen
without its title or contents. The cited and additional-source groups rendered.
The ice answer included redundant literal `S1`/`S3` labels beside proper citation
links; this remains an answer-formatting limitation, not a passed polish check.

Guest-to-Google linking succeeded through the registered development callback.
All three conversations, runs and reservations moved to the registered owner;
there was exactly one link carrying six used credits, and the old guest had zero
sessions. The signed-in UI showed 32 credits (40 minus two earlier credits and
six guest credits), expanded model selection, and the transferred history. A
transferred answer survived reload. Known costs (761, 746 and 817 microUSD) and
unknown-cost holds (49,239, 49,254 and 49,183) remained unchanged after linking.
Signing out and trying another guest trial displayed a denial; the durable trial
marker remained. This proves reuse protection in the same browser, not immunity
to clients discarding cookies or changing networks.

The preview operator budget `hosted-guests-20261024` has DAY and PERIOD windows
of $0.20 each, bounding the same spend, expiring October 25 at 18:16:35 UTC. It uses
the same non-resetting $1 key. Production operator budgets and old holds were not
changed. Before the production guest smoke, each production window had $0.25
available under its existing $0.40 ceiling. Unknown-cost holds are not receipts.

Ignored evidence includes `pr13-hosted-guest-linked.json`,
`pr13-hosted-guest-prelink.json`, `pr13-turnstile-live-rejection.json`,
`pr13-hosted-guest-key-final.json`, and the guest answer, isolation, quota,
linked-history and repeat-trial screenshots. Console capture included third-party
Turnstile-style obfuscated messages and an earlier pre-redeployment React error;
this is not a claim of a completely clean captured console.

### Canonical public guest smoke — October 25 IST

Production deployment `H3iPd4cxC2qT5J29bL5FWMGVPeap` is Ready and serves the
canonical domain with guests enabled. Unauthenticated `/sign-in`, `/privacy`
and `/terms` returned 200. Real Managed Turnstile admission gave a new guest six
credits and only the nano model option. One rainbow answer completed in 10.178
seconds with five clickable citations and five source entries. Its source panel
worked, reload preserved the answer, and the balance changed to four credits.
Durable run `6491f68e-7b27-475e-88f9-e91496074721` is COMPLETED, with two credits
charged, 811 microUSD known cost and 49,189 microUSD unknown cost held. The
planner was deterministically SKIPPED. Earlier production cancellation/recovery
checks apply to the unchanged application source; this smoke did not rerun them.

Production Google linking then moved the conversation to the existing owner,
carried two used guest credits exactly once, and revoked the guest session.
The UI showed 36 remaining free-plan credits, and the transferred answer remained
accessible. This tests the actual production OAuth callback, using the owner
account; a separate previously unlisted Google account was not tested.

The production operator windows now each have $0.20 available (same exposure,
not additive): 198,184 microUSD reserved and 1,816 settled under each $0.40
ceiling. At 50,000 microUSD reserved per research run, that is capacity for only
four additional reservations absent cost reconciliation. These windows expire
October 25 at **21:04 IST**; research fails closed when capacity or time expires.
The $1 key expires October 29 at 18:12 UTC. Public guest entry is enabled, but
these intentionally bounded settings are not an indefinite service allowance.
No budgets were enlarged, old holds released or spend counters reset.

Production evidence: `pr13-production-guest-answer.png`,
`pr13-production-guest-linked.json`, `pr13-production-guest-final-budget.json`
and `research-accounting-bead1a59-d56c-4b33-b18a-e904bd7e8d33.json` in ignored
`.artifacts`. Source-only documentation updates do not alter that deployed build.

### Deferred false refusal and rejected experiments

The owner accepted deferring the original benign quoted-injection refusal to
prioritize launch. Runtime input safety remains exactly input-v9; the prompt,
transport and runtime unit tests were restored after experimentation. No later
safety candidate was deployed and no privacy, cost or refusal guard was relaxed.

This is a bounded acceptance, not a claim that only one possible prompt fails.
Expanded diagnostic variants also exposed benign false refusals and category
mismatches. Experimental input-v10–v16 candidates introduced distress-routing,
category or availability regressions. Even when focused fixtures passed, larger
samples failed; none qualifies as a passing replacement. The alternative Google
route had no endpoint satisfying the existing ZDR constraint, which was retained.
Other routes did not pass the diagnostic. Further paid safety tuning is deferred.

The new opt-in diagnostic preserves each run's prompt hash, revision, route,
responses, verdicts and cap metadata in ignored artifacts. A selected-case or
alternate-route result is diagnostic evidence only and cannot certify the full
production safety corpus. Historical version IDs remain accepted by evaluation
report parsing; this does not activate those versions in the application.

## Remaining gates and owner inputs

1. Complete independent safety/quality acceptance beyond the explicitly deferred
   benign refusal. Hosted cancellation now passes. Reconcile unknown costs only
   with verified receipts; keep the $1 key cap unchanged.
2. Hosted Turnstile, guest quota, ownership isolation, repeat-trial denial and
   Google history transfer checks pass. Canonical post-deployment smoke also
   passes; guests are enabled within the finite budget windows above.
3. Policy publication and Google branding are complete. Keep retention disclosures
   aligned with actual provider settings as the service evolves.
4. The owner approved the eligible Google support address; no IAM change is needed.
5. Google audience publication and owner history transfer pass. A separate
   non-test Google account has not completed a callback in this session; public
   eligibility is configured, but that independent account check remains pending.
6. Hosted stale-run repair and manual maintenance invocation now pass. Finish
   scheduled cron delivery, retention, alerting and
   representative latency checks. Previous restore/rollback evidence keeps
   its original limited scope. Razorpay remains a later, disabled integration.

Guests were enabled after the approved canonical smoke described above. This
checkpoint does not establish full release acceptance; the current
[release checklist](release-checklist.md) records the remaining gates.

## Local evidence

Ignored evidence includes `research-launch-check-final.log`,
`research-launch-build-final.log`, `research-launch-browser.log`,
`cancel-usage-red.log`, `cancel-usage-green.log`, `public-policy-build.log`,
`research-launch-safety-v9-final.log`, `planner-route-probe.json`,
`research-accounting-3817ada2-5708-4acf-bd59-4c0aa8ec8a67.json`,
`research-hosted-cap-before-cancel.json` and the `hosted-research-*.png` images.
Full final safety observations live under
`.artifacts/safety-route/d4fe5504-bb47-40b0-9c36-f8ba8d82b57a/`.
No credentials or private maintenance files are included in Git.

Additional ignored evidence: `pr13-approved-test-allowance.json`,
`pr13-hosted-cancellation-restored.png`, `pr13-hosted-recovery-final.png`,
`pr13-hosted-recovery-canary.json`, `pr13-hosted-recovery-sweep.json`,
`pr13-hosted-unauth-smoke.json`, `pr13-final-key-metadata.json`,
`pr13-deferred-final-check.log` and `pr13-deferred-final-build.log`.
The rejected input-v16 full sample is preserved under
`.artifacts/safety-route/4349992f-0cdb-4948-83c5-b620d157433e/`;
focused attempts are under `.artifacts/injection-intent/`.

Published-policy evidence: `pr13-approved-policy-hosted-check.json`,
`pr13-published-privacy.png`, `pr13-policy-approved-lint.log`,
`pr13-policy-approved-build.log`. No paid model call was made during this
publication checkpoint; the last verified key usage remains $0.167717870.
