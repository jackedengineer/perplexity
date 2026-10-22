# T08–T10 guarded answers

The pipeline is internal until T11 connects admission, guards, retrieval and final
committed delivery. No public submit endpoint, raw draft stream or provider
reasoning is enabled by these tasks. Existing conversation UI remains usable.

## Private generation

Pin AI SDK 7 and the matching OpenRouter provider. Use `generateText` for one
nonstreaming attempt, no tools, no retry, no telemetry input/output recording.
The original approved question and exact selected passage IDs/text are data;
source URLs and unrelated conversation history are not sent to the answer role.

Require explicit server-only MODEL_ANSWER and ANSWER_OPENROUTER_PROVIDER settings
alongside OPENROUTER_API_KEY. There is no default model, model alias fallback,
client override or paid-account activation. Answer routing requires a single
provider, ZDR, no data collection, supported parameters and fixed price ceilings.

The adapter caps its serialized request at 20,000 UTF-8 bytes, response at 24,000
bytes, output at 1,200 tokens / 4,000 characters and generation at twelve seconds
within the original run deadline. Unfinished/refused/tool-call/oversized output
is unavailable, not a truncated success. Provider failures never expose prose.

Drafts stay in bounded process memory. No-evidence runs skip answer generation;
the fixed insufficient-evidence response must still pass output approval. A
citation is a provenance pointer, never a factual-verification guarantee.

Usage values are independent of answer text. Convert reported decimal USD to
integer micro-USD using conservative upward rounding; missing/malformed values
remain unknown. Never replace an unknown provider outcome with zero usage or
automatically repeat it. Final settlement must preserve that distinction.

Protocol references: [AI SDK generateText](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text)
and [OpenRouter AI SDK provider](https://github.com/OpenRouterTeam/ai-sdk-provider).
Dependency installation uses pinned versions and disabled scripts; the existing
moderate audit advisory remains, with no high/critical production advisory.
