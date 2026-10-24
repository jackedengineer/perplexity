# Research recovery and guest launch checkpoint — 24 October 2026

This checkpoint supersedes the active-state portions of
[production-hosting.md](production-hosting.md). Earlier failed samples remain
valid historical evidence. Research now completes for the signed-in test owner;
public guest access and public Google sign-in are still gated.

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
- `/privacy` and `/terms` are explicitly marked drafts for owner review, using
  the requested name `perplexity` and `trainwithchirag@gmail.com`. They are
  available in the branch preview, not yet used for Google publication.

Migration 0021 adds planner-v6 to the database allowlist and has been applied to
development and production. Its generated Drizzle snapshot is the mechanical
exception to small focused commit sizes. No existing financial records changed.

## Active hosted configuration

Production source is `ea73c7f4cecd558664d70a3a0ecd0685613a29d9`, deployment
`BpnJ6z5eFmdSDiPju4Y47SHupqs3`, promoted through Vercel and observed Ready with
the `perplexity-gold-alpha.vercel.app` alias. Policy drafts are in the later
`21a1076` branch preview and are deliberately not represented as approved terms.

| Role | Model | Pinned provider |
| --- | --- | --- |
| Input/evidence/output safety | Mistral Small 3.2 | `mistral/eu` |
| Model-backed planning | Mistral Small 3.2 | `deepinfra/fp8` |
| Standard answers | GPT-4.1 mini | `azure` |
| Enabled economy answers | GPT-4.1 nano | `azure` |

There are no automatic provider retries or fallback expansion. Production
Turnstile configuration is installed, but `ENABLE_GUEST_TRIALS=false` remains.
Payments remain disabled. Google remains External / Testing with one test user.

The OpenRouter key retains its non-resetting **$1** cap and expires October 29
at 18:12 UTC. The October 24 16:42 UTC metadata observation reported
$0.167717870 used and $0.832282130 remaining. The cap and expiry were verified
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
2. Exercise hosted Turnstile challenge acceptance and rejection, guest quotas,
   ownership isolation and guest-to-Google history transfer before broad public
   access. Local mocked checks are not substitutes for these hosted checks.
3. Review the policy drafts, including operator identity and backup, security-log
   and provider retention details. Publish approved pages and use their stable
   production URLs in Google branding.
4. Make `trainwithchirag@gmail.com` eligible as Google support contact. The
   current signed-in account's dropdown offers only its own email and no managed
   Google Groups; the requested address cannot currently be selected. Sign in
   with the supplied address and appropriate project access, or provide an
   eligible managed support group. No IAM permissions were silently changed.
5. Complete Google branding and public audience publication, then verify a
   non-test-user callback and guest-history transfer. The existing owner login
   does not establish public eligibility.
6. Hosted stale-run repair and manual maintenance invocation now pass. Finish
   scheduled cron delivery, cross-user privacy, retention, alerting and
   representative latency checks. Previous restore/rollback evidence keeps
   its original limited scope. Razorpay remains a later, disabled integration.

Guests have **not** been enabled: the user's condition that checks pass is still
unmet. This checkpoint is not a declaration of full public-launch readiness.

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
