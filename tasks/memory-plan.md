# Plan: Memory v1

Spec: [`docs/memory-spec.md`](../docs/memory-spec.md). Branch: `feature/memory-v1`, one commit per task. Tasks: [`tasks/memory-todo.md`](memory-todo.md).

## Approach

Build from the database outward. Each slice is tested before the next one depends on it:

1. **Schema.** Tables, grants and the conversation flag.
2. **Store.** Settings, Delete all, the reader query, and applying operations under a lock.
3. **Reader.** Memories reach Chat and Web answers. Checkpoint A: seed a memory in local SQL, and answers adapt.
4. **Extraction.** Pure checks, the model call, then wiring it in with `after()` once a run completes. Checkpoint B: memory works end to end, automatically, with no UI yet.
5. **Surface.** Settings API, Memory dialog, temporary chat. Checkpoint C: browser suite.
6. **Quality and ship.** Eval set, docs, PR, CI, then production with the user's approval.

## Decisions made while planning

- **Extraction runs after the answer is saved, not inside the run.**
  - Budget version 2 stage caps total 49,850 of the 50,000 µUSD run reserve. A 2,000 µUSD extraction claim during the run could starve a later stage, such as the output check.
  - Run budget, settlement and reconciliation code is heavily guarded, and memory shouldn't touch it.
  - So extraction gets its own ledger, `memory_extractions`, one row per run, following the `documents.cost_micro_usd` precedent. It also gets a daily cap of 100 per user.
- **`after()` is passed in as a dependency** (`schedule: (work) => void`) and defaults to Next's `after`. Tests can then run the work inline.
- **The tokenizer moves to `src/server/ai/text.ts`.** The planner's private `words()` moves there and is re-imported by `plan.ts`. Planner behaviour must not change, and the existing planner tests prove it.
- **Grounding excludes framing words** (`lives`, `works`, `prefers`…), so "Lives in Pune" taken from "I'm … in Pune" passes.
- **Settings row:** `memory_settings` is created lazily (`INSERT … ON CONFLICT DO NOTHING`) and locked `FOR UPDATE` while operations are applied.
- **The extraction provider reuses the planner's model configuration** (`SafetyModelConfig`, set up in `src/server/chat/service.ts`) and the bounded-fetch pattern from `planner-provider.ts`. It has a 16 KB wire cap, 400 output tokens and an 8-second timeout.

## Risks and how they're handled

| Risk | Handling |
|---|---|
| Wrong or sensitive memories saved silently (nothing is shown) | Gate, sensitive patterns, grounding check, prompt rules; the offline eval must hit 0 sensitive, 0 ungrounded and ≤1 wrong in 40 before the PR |
| `after()` behaviour in this Next 16 / OpenNext build | Read `node_modules/next/dist/docs` on `after` first (AGENTS.md); uploads already use it in production (`src/server/documents/index.ts`) |
| Prompt version bumps (`answer-v11`, `chat-v3`) affect stored records or evals | Grep for `ANSWER_PROMPT_VERSION` and `CHAT_PROMPT_VERSION` uses before bumping, and update the snapshots |
| The reader block pushes answers past the 20 KB packet | Memories are dropped first in `prepareDraftInput` and `prepareChatInput`; a unit test proves evidence and history are kept |
| Workers CPU budget (`docs/cloudflare-cpu.md`) | Extraction is mostly I/O; zod checks run on at most 3 operations; measure in the production check |
| The production migration adds a column to `conversations` | A constant default means no table rewrite on Postgres 11+; run it only with the user's explicit approval, as before |
| Paid live eval | Ask first; the offline eval uses recorded outputs |

## What can run in parallel

- **After T1:** T2, T5, T6 and T8 are independent.
- **T3** needs T2.
- **T4** needs T2.
- **T7** needs T2, T5 and T6.
- **T9** needs T3 and T8.
- **T10** needs T5 and T6.
- **T11 and T12** come last.

## Checkpoints

- **A, after T4:** with a memory inserted by hand locally, a Chat and a Web answer reflect it. Planner input and search queries contain no memory text. `pnpm check` passes.
- **B, after T7:** "I'm a civil engineer in Pune, …" locally creates two memories and one `memory_extractions` row. "What is the GDP of India?" creates no row. An extraction failure leaves the answer intact.
- **C, after T9:** the Playwright memory suite passes, the existing suites still pass, and the phone-width check is done.
- **Ship, T12:** CI is green, then the production migration and deploy (each with the user's approval), then a read-only verification and one manual round in the owner's account.
