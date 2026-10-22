# Server-side safety and release policy

Status: proposed policy `v1`, 2026-10-22. Implement and evaluate this alongside the first live model integration. This is an application policy proposal, not a statement that classifiers can detect every unsafe request.

## Assets and trust boundaries

Protect users' private conversations, provider credentials, usage budgets, evidence integrity and the public response surface. Trust boundaries are browser → route, session → owned records, route → provider, retrieved content → model context, model draft → policy decision, and approved response → browser/history. Treat browser input, third-party results and model output as untrusted.

Primary abuse cases: access another user's thread, submit concurrent paid runs to bypass quota, turn a benign-looking follow-up into harmful instructions, inject commands through a page, leak credentials through an answer/link, or obtain an unchecked draft through a secondary endpoint.

## 1. Decisions and behavior

```typescript
type GuardDecision =
  | { decision: 'ALLOW'; categoryCodes: string[]; policyVersion: string }
  | { decision: 'BLOCK'; categoryCodes: string[]; publicReason: string; policyVersion: string }
  | { decision: 'UNAVAILABLE'; retryable: boolean; policyVersion: string };
```

Runtime validation rejects unknown verdicts, missing fields and free-form responses. Classifier text cannot change policy, tool permissions or thresholds. Public reason codes are selected by server mapping, not blindly echoed classifier prose.

- `ALLOW`: proceed to the next permitted stage.
- `BLOCK`: terminate the run; return a pre-reviewed static response. Do not forward the rejected input to planning, search or answer generation.
- `UNAVAILABLE`: timeout, outage or malformed verdict. Return a safe retry message, settle known usage, and do not bypass required checks.
- Ambiguity about what the user wants belongs to the planner; ambiguity that prevents a safe policy decision is handled conservatively without inventing intent.

Use a concise reason-code taxonomy. Public refusals should be understandable without revealing detector patterns or operational details.

## 2. Proposed content policy

Block assistance that materially enables credential theft, fraud, unauthorized intrusion, malware deployment, violence, sexual exploitation, or harmful instructions for self-injury. Block disclosure of private credentials and nonpublic personal data the requester is not entitled to access. Define exact categories and escalation rules in versioned fixtures before launch.

Allow ordinary explanations, prevention, defensive security, legitimate analysis and discussion of sensitive topics. Do not blanket-ban a word, political viewpoint or topic because it appears “fishy.” A request for phishing awareness and a request for credential theft need different outcomes. Help-seeking distress should receive an appropriate supportive safe response rather than a punitive generic rejection; use reviewed response templates for such routing.

Harm classification and accidental-secret handling are distinct. For high-confidence secrets, ask for a redacted resubmission or redact using a documented policy before any external call. Do not treat every number, email or technical identifier as prohibited. Avoid forwarding unrelated private conversation history to Tavily.

This initial research app has no code execution, shell, arbitrary SQL generation/execution, email sending, account actions or destructive tools. Model outputs cannot introduce those capabilities.

Guest, registered Free and paid model choices all pass the same safety and release boundaries. Session/tier/model authorization is an independent prerequisite: a forged model key or billing claim must fail before task work, even when the text is otherwise allowed. Lower answer-model cost is not permission to remove input/evidence/output checks. Billing and anonymous abuse counters include rejected attempts so customer-credit refunds cannot create an unbounded safety-classifier expense.

## 3. Input gate

Order:

1. Body byte/character limits, schema validation, authentication, CSRF/origin checks and ownership.
2. Cheap abuse throttling, active-run limit and atomic usage reservation/idempotency.
3. Deterministic checks for malformed control data, high-confidence accidental secrets and known application abuse. Normalize for inspection without replacing the user's original meaning; bound Unicode/encoding processing.
4. Semantic classification of current input plus bounded relevant server-owned context. Review multi-turn intent; checking only the newest sentence is insufficient.
5. Store the accepted original user message; permit planning only after approval.

Deterministic checks can stop requests before any LLM. Semantic classification may itself call a model; it precedes the task models. Start with `MODEL_SAFETY` through the configured OpenRouter adapter, isolated from task prompts, no tools and strict structured output. Keep a `SafetyProvider` interface so a specialist moderation endpoint or local classifier can replace it. Its actual quality and multilingual coverage are explicit release criteria, not assumptions.

Do not rewrite a harmful request into innocent wording and then moderate only the rewritten text. Evaluate the original first. Do not let a user supply an `isSafe`, `skipModeration` or system-role field.

## 4. Planner and retrieval gates

Validate the planner output, cap query counts and retain provenance for explicit constraints. Inspect the actual outbound search queries before sending them to Tavily. If a query introduces prohibited intent or secrets, stop it; do not treat it as authorized because a model wrote it.

Before synthesis, schema-validate retrieved results, remove executable/hidden markup, inspect for prompt-injection patterns and enforce provenance/size limits. High-risk passages can be excluded; if necessary context cannot be used safely, return an insufficient-evidence response. Quoting delimiters and detector scores reduce risk but do not guarantee injection immunity.

All retrieved text is evidence data, never a system instruction. The answer model cannot choose arbitrary tools, change policy or fetch URLs itself. Network clients call fixed configured APIs only. Source URLs and titles remain untrusted display data even when returned by a provider.

OWASP describes indirect injection and output-handling risks; enforce permissions outside the prompt. ([Prompt injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html))

## 5. Output gate and streaming

Required strict path:

```text
private draft
  → resolve citations and construct final visible payload
  → validate format, links, secret leakage and semantic safety
  → optional factual support checks
  → freeze approved payload
  → commit approved payload and terminal run state
  → release that exact payload
```

The complete answer is held in bounded server memory. It is not written as an ordinary assistant message, sent through telemetry or merged into a browser stream while pending. No provider reasoning/thinking fields are returned or logged. A classifier receives only the data needed for its check, never credentials.

Check the answer, title, clarification, suggestions, source metadata and any user-visible explanation. Safety status and factual-support status are separate. Unknown citation IDs, malicious link schemes or secret leakage are deterministic release failures even if a classifier says `ALLOW`.

Before approval, stream only application-owned fixed stage labels. Chunk-by-chunk moderation alone cannot provide the same contract: harmful meaning may span chunks and previously sent tokens cannot be recalled. Sending the approved complete answer sacrifices live token latency to preserve the release boundary. Do not market post-approval chunking as faster generation.

If output is blocked, discard the draft and return a static safe response. Initially do not automatically regenerate; a bounded repair policy may be added only with full rechecking and a shared budget. An unavailable guard never falls back to “show it anyway.”

An internal branded type such as `ApprovedResponse` can make accidental bypasses harder, but a TypeScript cast is not a security boundary. Keep construction private to the release module and test every transport/read endpoint against the same runtime approval predicate.

All approved records store `policy_version` and `approved_at`. A tightened policy can quarantine older responses pending recheck; caching and history must not bypass current restrictions. Delete/expiry rules also apply to cached data and retained evidence.

## 6. Output rendering and network controls

Render escaped text/Markdown with raw HTML disabled. Construct citations from the run's source registry; allow only validated HTTP(S) URLs without embedded credentials. External links use appropriate protections. Do not auto-fetch output images, render arbitrary iframes, execute code or evaluate model-written SQL.

Initially use Tavily Extract instead of a direct server fetcher. If direct fetching is introduced, require public-network-only egress, DNS-rebinding-safe address validation and redirect revalidation as well as response type/size/time limits. A one-time hostname regex or DNS lookup is insufficient. ([OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html))

Provider-side OpenRouter filters, restrictions and spending controls are a second layer. Test that controls are assigned to the actual application key; creating an unassigned guardrail enforces nothing. Keep application gates for Tavily, response release and persisted reads. ([OpenRouter guardrails](https://openrouter.ai/docs/guides/features/guardrails))

## 7. Audit, retention and failures

Store stage, verdict, category code, policy/detector versions, request/run IDs and latency. Default rejected-text retention is zero; the admission record keeps an HMAC fingerprint for duplicate detection. Do not log raw rejected requests or unsafe drafts. Accepted private conversations and bounded evidence have the retention/deletion rules in the system design. Debug content capture requires an explicit, restricted, time-limited operational procedure.

Classifier/model providers still receive the minimum text required for their work. Configure provider allowlists and retention controls deliberately; an application's no-log setting does not determine a vendor's retention behavior.

Distinguish policy rejections, service unavailability and configuration failures in internal metrics. Return only safe public codes. Repeated abuse consumes throttling allocation even if it does not invoke the answer model.

## 8. Required verification

- Input denial or classifier failure results in zero planner, search and answer calls.
- Generated-query denial results in zero Tavily calls for that query; no silent bypass.
- A denied or unavailable output check results in zero draft bytes in stream, history, status, source panels or logs.
- A multi-turn harmful intent cannot be made safe merely by submitting a short neutral follow-up.
- Educational/defensive near-misses remain allowed in the curated set; measure false refusals separately.
- Unicode, obfuscation, prompt injection in sources and policy-conflicting instructions have regression cases.
- Citation-ID validity, allowed link schemes and secret checks are independent of semantic `ALLOW`.
- Cache replay, page reload, alternate routes and a policy-version change preserve the release boundary.
- Provider timeouts, malformed classifier JSON, cancellation races and failed DB finalization expose only safe errors.

Report the dataset, denominator, false positive/negative rates and known coverage limits. Passing a finite adversarial suite is required evidence, not proof that all future attacks will be blocked.
