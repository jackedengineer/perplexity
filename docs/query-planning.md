# Planning and evidence interpretation

The original accepted user message remains authoritative and unchanged. Planning is a private, tool-free structured call using an explicitly assigned MODEL_PLANNER and PLANNER_OPENROUTER_PROVIDER. No answer/safety-role configuration is silently reused. The planner has one attempt, a five-second deadline and a 1,024-output-token ceiling. Provider routing requires privacy controls and price ceilings ($0.075/$0.20 per million input/output tokens).

The validator rejects invented topical vocabulary, numbers, assumptions and constraints without a literal USER-message quote and matching server message ID. Assistant history may identify an entity but cannot supply a user budget or serve as current evidence. This conservative lexical check is not semantic equivalence or a safety proof. Every outbound query still needs independent safety approval.

A clarification is one short question, never an answer or a URL. It is still private until output safety approval and atomic persistence. An unavailable planner may fall back to the exact original only for a short, unambiguous standalone explanatory question; ambiguous references fail closed. Search fanout and publication filters are server bounded. Authenticated conversation history and the current clock/locale are server inputs, not browser-supplied history.

Initial verification: ten offline tests cover model-role isolation, bounded structured dispatch, receipt retention, invented scope, negation/budgets, assistant constraint laundering, ambiguous references, freshness invention, no-tool planning, and unavailable-provider fallback. Live relevance and independent human acceptance are separate checks.

## Execution and clarification

Plans are immutable, private `run_plans` rows tied by composite foreign keys to the owned run and accepted USER message. The planner's 2,000 microUSD stage fits the existing 50,000 microUSD reservation. Original-text hashes and selected context IDs preserve provenance without public prompt telemetry. Provider work stays outside transactions and continuation rechecks owner, attempt, revision and absolute deadline.

Context selection uses at most six whole recent approved messages and 6,000 characters, with canonical output hashes and terminal-state verification for assistant turns. Older messages outside that explicit window are not a semantic memory guarantee. Every new follow-up is reclassified with the selected context. Unavailable, stale or malformed context fails closed.

Clarification has a dedicated terminal state, approved history/status delivery and zero answer credits. Atomic completion checks that its text exactly matches the stored CLARIFY plan and that no retrieval or answer was dispatched. The next reply gets a new idempotency key, admission, reservation and plan in the same owned conversation. A composer remounts per intent, preserving recovery of uncertain requests and the committed revision for immediate replies.
