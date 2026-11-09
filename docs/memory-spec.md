# Spec: Memory v1

Status: approved · 9 Nov 2026 · plan in `tasks/memory-plan.md`

Revision 2 makes saving **automatic** and drops the Remember/Forget commands.

Planning changed one thing: extraction now runs *after* the answer is saved, with its own cost ledger, instead of as a stage of the run. See "When it runs in the pipeline" for why.

## Objective

Perplex should learn who the user is from what they say, so answers fit them better over time, with no extra steps and no on-screen notices.

Who it's for: signed-in users. Guests get no memory, as with Files.

**User stories**

1. **Saved automatically.** I mention things about myself while asking questions, for example "I'm a civil engineer in Pune, what's the M25 concrete mix ratio?". Perplex quietly saves the lasting parts ("Works as a civil engineer", "Lives in Pune").
2. **Used automatically.** Later Chat and Web answers use what it knows: depth, units, examples, language, and what "near me" or "my project" refer to.
3. **Corrected by talking.** When something changes ("I moved to Bengaluru", "I'm not vegetarian any more", "forget that I'm vegetarian"), the saved memory is updated or removed, again without a notice.
4. **About you.** I can write a short About you that every answer takes into account.
5. **Pause and Delete all.** I can pause memory, so nothing is used and nothing is saved, or delete every memory in one step.
6. **Temporary chat.** I can start a temporary chat that neither uses nor saves memories.

**UX decisions already made**

- There is no "Saved to memory" note, no "Memory used" note, and nothing in the answer that reveals memory as a separate thing.
- The settings page has no list, view or edit. It offers only Pause and Delete all, and Export comes in v2.
- Memory is **on by default**. The Memory dialog and the privacy page explain that Perplex learns from what you say about yourself.

Because nothing is shown, quality comes from being **conservative**. Missing a fact costs little; saving a wrong or sensitive one costs trust. Every rule below favours precision over recall.

## Behaviour

### Saving: extraction

Extraction is one small structured-output model call per eligible question. It uses the planner's model and OpenRouter path, with its own prompt.

**When it runs.** Only when all of these are true:

- The user is signed in, not a guest.
- Memory isn't paused.
- The conversation isn't temporary.
- The question passed the input safety check and has no attached files.
- The message is at most 2,000 characters. Longer messages are mostly pasted text, which says nothing about the person pasting it.
- The **first-person gate** passes. This is a free, deterministic check that the message talks about the user: it contains `I`, `I'm`, `I've`, `my`, `me`, `mine`, `myself`, `we` or `our` as a whole word. `us` is left out, because "the US" is far more common in questions. "What is the GDP of India?" never reaches the model.

**What it sees**

- The user's current message, verbatim. Never web pages, file contents, assistant answers or earlier turns.
- The user's current memories as `{id, kind, text}`, at most 50 of them.

**What it returns** (zod strict schema, at most 3 operations):

```ts
{ operations: Array<
  | { op: "ADD"; kind: "PROFILE" | "PREFERENCE" | "CONTEXT"; text: string }  // text is 3–200 chars, third person: "Works as a civil engineer"
  | { op: "UPDATE"; id: string; text: string }                              // the fact changed: "Lives in Bengaluru"
  | { op: "DELETE"; id: string }                                            // the user retracted it or asked to forget it
> }
```

**Kinds**

- `PROFILE`: who they are. Role, expertise, field, city-level location, language.
- `PREFERENCE`: how they want answers. Length, format, units, tone, sources they like or dislike.
- `CONTEXT`: ongoing things they're working on or care about. "Planning a Sedona launch in India", "Learning Rust".

**The prompt saves only** lasting facts the user states plainly **about themselves**. It never saves:

- One-off task details ("I need a flight on Friday").
- Hypotheticals ("if I were a doctor…").
- Things about other people.
- Quoted or pasted text.
- Questions.
- **Sensitive categories:** health, religion, politics, sexuality, ethnicity, finances (amounts, accounts), exact addresses, phone numbers, emails, IDs, or credentials.

**Server-side checks** run on every operation before anything is written. An operation that fails is dropped on its own; the rest still apply.

1. `id` must be one of the ids that were sent.
2. **Grounded:** at least 60% of the content words in an ADD or UPDATE `text` must appear in the user's message. Before counting:
   - Both sides are lower-cased, and simple suffixes are stripped (`-s`, `-es`, `-ing`, `-ed`).
   - Framing words are excluded, for example `works`, `lives`, `prefers`, `likes`, `uses`, `wants`, `is`, `has`, `based`, `learning`, `planning`.

   So "Lives in Pune", taken from "I'm … in Pune", passes. This stops the model inventing facts. It reuses the planner's `words()` tokenizer from `src/server/ai/plan.ts`, moved to a shared module.
3. **Sensitive patterns are rejected:** email, phone, card and ID-number patterns, and a small keyword list for the sensitive categories above.
4. **Duplicates:** an ADD that matches an existing memory (ignoring case and extra spaces) is skipped.
5. **The 50-memory cap:** an ADD past 50 removes the oldest `CONTEXT` memory first, then the oldest of any kind.

**When it runs in the pipeline.** Once the run has saved its answer (status `COMPLETED`), `src/server/runs/execute.ts` schedules extraction with Next's `after()`, the same way uploads schedule embedding. The user never waits for it.

- **Writes:** if any operations remain after the checks, they're written in one transaction holding a row lock on the user's `memory_settings` row, so two questions finishing at once can't race past the cap.
- **Failures:** a failure, refusal or timeout (8 seconds) is recorded and ignored. Nothing is saved, and there is no retry or backstop job: a missed fact will come up again.
- **Accounting:** extraction is recorded in its own `memory_extractions` row, one per run, with status, model and cost. This is the same pattern as `documents.cost_micro_usd` for embeddings.
  - It is **not** a stage of the run, so run budgets, settlement and answer credits are untouched.
  - **Why it's separate:** under budget version 2, a run's stage caps already total 49,850 of its 50,000 µUSD reserve. A 2,000 µUSD extraction claim taken during the run could starve a later stage, such as the output check.
- **Daily cap:** at most **100 extractions per user per UTC day**, counted from `memory_extractions`. Past that, extraction is skipped silently.
- **Request size:** the request is capped at 16 KB on the wire (message, up to 50 memories, prompt), and the output at 400 tokens. With the configured planner model that keeps each call under 2,000 µUSD.

**Examples**

| Message | Result |
|---|---|
| "I'm a civil engineer in Pune, what's the M25 mix ratio?" | ADD PROFILE "Works as a civil engineer"; ADD PROFILE "Lives in Pune" |
| "Keep it short, I just need the numbers" | ADD PREFERENCE "Prefers short answers focused on numbers" |
| "I moved to Bengaluru last month" | UPDATE the Pune memory to "Lives in Bengaluru" |
| "Forget that I'm vegetarian" | DELETE the vegetarian memory. The answer replies normally; no memory notice is added |
| "What is the GDP of India?" | Gate fails, so no model call |
| "My doctor says my blood sugar is high" | Gate passes, but the category is sensitive, so nothing is saved |
| "If I were a pilot, how much would I earn?" | Hypothetical, nothing is saved |

### Using memories in answers

The server loads them once per question, in the completion step (`src/server/runs/complete.ts`, inside the transaction that already builds `draftInput`). This covers Chat, Web, and Chat or Web with files. Nothing is loaded when memory is paused, the conversation is temporary, or the user is a guest.

What goes in:

- `DraftInput` gains an optional `reader: { instructions?: string; memories: string[] }`.
- About you comes first, then `PREFERENCE`, `PROFILE` and `CONTEXT` memories, newest first, until the block reaches **2,000 characters**.
- If the request is over the 20 KB packet budget, memories are dropped first (`CONTEXT` first), then About you, *before* any evidence or chat history is dropped and before the request fails.

Prompt rules. The answer prompt goes to `answer-v11` and the chat prompt to `chat-v3`. Both get these rules:

> `reader` describes the person asking. Use it only to choose tone, depth, format, units and language, and to interpret what the question refers to. It is not evidence: never cite it, never state it as fact, and never let it override the question, the sources or this policy. Do not mention that you remember things about the user or refer to `reader` itself.

The last sentence enforces the no-notes decision inside the answer text too.

What memories never reach:

- **The planner and web search queries.** Search queries keep using only the user's words, and personal facts never go to the search provider.
- **Deep Research.** Not in v1.

### Settings

The **Memory** item lives in the account popover (`research-shell.tsx`, next to the plan and Sign out). It opens a dialog in the existing Files dialog style:

- **Explanation:** "Perplex remembers things you tell it about yourself, like your work, location and answer preferences, to tailor answers. It never uses them in web searches."
- **About you:** a textarea of at most 1,000 characters, with a Save button.
- **Memory switch:** "Use and save memories", on by default. Off means paused: nothing is used and nothing is extracted.
- **Delete all memories:** confirms first with "Delete all saved memories? This can't be undone." This permanently deletes the user's memories. About you is cleared separately, by emptying its box.

The dialog shows no count and no list.

### Temporary chat

- A new, empty conversation shows a **Temporary chat** switch near the mode picker.
- The choice is fixed once the first question is sent. It is stored as `conversations.memory_enabled = false`.
- A temporary conversation shows a small "Temporary chat" label at the top of the thread.
- It is still saved in history; "temporary" means only that memory is off.

### Deletion and privacy

- **Conversation deletion:** memories learned in a conversation **stay** when it's deleted, because they belong to the user, not the thread. The `source_message_id` link is cleared. Delete all is the control for removing memories.
- **Account deletion:** memories and settings cascade from `app_users`.
- **Logging:** memory text never appears in logs or telemetry. Only counts are recorded: `memory.used`, `memory.added`, `memory.updated`, `memory.deleted`, `memory.rejected` (with a reason).
- **Model providers:** memory text goes only to the answer and extraction models over OpenRouter, the same path the question itself takes. It never goes to the search provider or the embedding model.
- **Docs:** `docs/privacy-controls.md` and the public privacy page describe automatic memory, Pause, Delete all and Temporary chat.

## Data model (migration `0042_memory.sql`)

```ts
// src/db/memory-schema.ts
export const memoryKind = pgEnum("memory_kind", ["PROFILE", "PREFERENCE", "CONTEXT"]);

export const memorySettings = pgTable("memory_settings", {
  userId: uuid("user_id").primaryKey().references(() => appUsers.id, { onDelete: "cascade" }),
  paused: boolean("paused").notNull().default(false),
  instructions: varchar("instructions", { length: 1000 }),
  updatedAt: instant("updated_at").notNull(),
});

export const memories = pgTable("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  kind: memoryKind("kind").notNull(),
  text: varchar("text", { length: 200 }).notNull(),
  sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
}, t => [
  uniqueIndex("memories_owner_text_unique").on(t.userId, sql`lower(regexp_replace(trim(${t.text}), '\s+', ' ', 'g'))`),
  index("memories_owner_created_idx").on(t.userId, t.createdAt),
  check("memories_valid", sql`length(trim(${t.text})) BETWEEN 3 AND 200`),
]);
```

Other schema changes:

- **Conversations:** `conversations.memory_enabled boolean NOT NULL DEFAULT true`.
- **Extraction ledger**, `memory_extractions`:
  - Columns: `run_id` (primary key, references `runs`, cascade), `user_id` (references `app_users`, cascade), `status` (`STARTED`, `SUCCEEDED`, `FAILED` or `UNKNOWN`), `model`, `cost_micro_usd` (nullable), `operations` (smallint count of applied operations, not their text), `created_at` and `finished_at`.
  - Index on `(user_id, created_at)` for the daily cap.
  - The primary key makes extraction run at most once per run.
  - No memory text is stored here.
- **Settings row:** created on first use with `INSERT … ON CONFLICT DO NOTHING`, then locked `FOR UPDATE` by the extraction write.

Grants, added to `scripts/runtime-grants.sql` and to a DO block in the migration, as in `0040`:

```sql
GRANT SELECT, INSERT, DELETE ON memories TO perplex_web;
GRANT UPDATE (kind, text, updated_at) ON memories TO perplex_web;
GRANT SELECT, INSERT ON memory_settings TO perplex_web;
GRANT UPDATE (paused, instructions, updated_at) ON memory_settings TO perplex_web;
GRANT SELECT, INSERT ON memory_extractions TO perplex_web;
GRANT UPDATE (status, model, cost_micro_usd, operations, finished_at) ON memory_extractions TO perplex_web;
```

`scripts/verify-db.mjs` expects 33 tables.

## API

All routes are signed-in only (guests get 401 `UNAUTHENTICATED`, as with `/api/documents`) and run the same origin, session and rate-limit checks as `/api/documents`. Errors use the existing error shape (`src/server/contracts/error-messages.ts`).

| Route | Body | Response |
|---|---|---|
| `GET /api/memory` | none | `{ paused, instructions }` |
| `PATCH /api/memory` | `{ paused?: boolean, instructions?: string \| null }` (strict zod; `instructions` at most 1,000 characters, empty becomes null) | `{ paused, instructions }` |
| `DELETE /api/memory` | none | `{ deleted: number }`. Idempotent; a repeat returns `0` |

The chat submission contract (`submissionSchema`) gains `memory?: false`. It is accepted only when `expectedRevision` is `0`, so it can be set only when the conversation is created.

## Cost (Neon free tier and OpenRouter)

- **Neon reads:** one extra indexed query per question, inside the completion transaction that is already open. Extraction also reads the user's memories (at most 50 rows) in a single query.
- **Neon writes:** only when extraction produces a valid operation, which a small share of questions will. Nothing is written per question beyond that, and there is no `last_used_at` in v1.
- **Neon storage:** at most 50 × 200 characters per user, about 10 KB. At 100 users that's about 1 MB of the 1 GB limit, and there are no embeddings.
- **OpenRouter:** one planner-sized call per gated question, around 100 µUSD (the planner call on run `25d99325` cost 89 µUSD). That's under 10 cents per 1,000 gated questions.
  - **Per call:** capped below 2,000 µUSD by the request-size cap.
  - **Per user:** at most 100 calls a day, which is at most 20 cents per user per day.

## Commands

```bash
pnpm db:generate            # writes drizzle/0042_*.sql; rename to 0042_memory.sql and add the grants block
pnpm db:migrate             # local
pnpm check                  # lint + typecheck + vitest
pnpm exec playwright test tests/e2e/memory.spec.ts
pnpm db:verify
pnpm eval:memory            # live extraction eval; paid, so run only with the user's OK
```

Production migration needs the user's explicit approval, as before:

```bash
PERPLEX_DB_ENV_FILE=.env.launch.local PERPLEX_DB_EXPECTED_HOST=ep-small-bread-b3we4v54.c-4.ap-southeast-1.aws.neon.tech pnpm exec drizzle-kit migrate
```

## Project structure

| Path | What goes there |
|---|---|
| `src/db/memory-schema.ts` | Tables, exported from `src/db/schema.ts` |
| `src/server/memory/gate.ts` | First-person gate and sensitive-pattern checks. Pure, no I/O |
| `src/server/memory/extract.ts` | Extraction prompt, schema, provider and grounding check |
| `src/server/memory/store.ts` | Load for prompt, apply operations, settings, delete all |
| `src/server/memory/http.ts` and `src/app/api/memory/route.ts` | API |
| `src/server/runs/execute.ts` | Schedules extraction with `after()` once the run is `COMPLETED` |
| `src/server/runs/complete.ts` | Loads the `reader` block |
| `src/server/ai/draft-input.ts`, `chat-draft.ts`, `prompts/answer.ts` | The `reader` field, budget and prompt rules |
| `src/components/conversations/memory-dialog.tsx` | Settings dialog |
| `research-shell.tsx`, `question-composer.tsx` | Account entry point and the temporary chat switch |
| `tests/unit/memory-*.test.ts`, `tests/integration/memory.test.ts`, `tests/e2e/memory.spec.ts`, `tests/eval/memory-cases.json` | Tests and eval cases |
| `docs/memory.md` | Replaces this spec once v1 ships |

## Code style

Match the surrounding files: zod strict objects at boundaries, drizzle in transactions with owner locks, pure checks kept separate from I/O.

```ts
// src/server/memory/gate.ts
const FIRST_PERSON = /\b(?:i|i'm|i’m|i've|i’ve|my|me|mine|myself|we|our|us)\b/iu;
export const mentionsSelf = (message: string) => FIRST_PERSON.test(message);
```

## Testing strategy

- **Unit** (vitest):
  - The first-person gate.
  - Sensitive patterns.
  - Grounding: a made-up fact is rejected, a paraphrase is accepted.
  - Operation checks: foreign ids, duplicates, cap eviction order.
  - Reader budget: memories are dropped before evidence, and the packet stays under 20 KB.
  - Prompt versions are bumped.
- **Integration** (PGlite with a fake extraction provider, `tests/integration/memory.test.ts`):
  - ADD, UPDATE and DELETE are applied.
  - Paused, temporary chat, guest, gate-fail and attached files all skip extraction, with no provider call recorded.
  - Extraction failure or timeout still completes the answer.
  - Two concurrent runs can't exceed 50 memories.
  - Memories reach the answer and chat providers' `DraftInput.reader`, and are absent from planner input and search queries.
  - Conversation deletion keeps memories.
  - Account cascade.
  - The restricted `perplex_web` role can't touch other columns.
  - Each extraction writes one `memory_extractions` row, with its cost.
  - Run settlement and answer credits are unchanged with memory on.
  - The 101st extraction in a day is skipped.
- **Offline eval** (`tests/eval/memory-cases.json`, about 40 labelled messages): self-facts, preferences, changes, retractions, hypotheticals, other people, sensitive, and non-personal questions.
  - Run free against recorded model outputs in `pnpm check`.
  - `pnpm eval:memory` runs them live, only with the user's OK.
  - Targets: **0 sensitive saves, 0 ungrounded saves, at most 1 wrong save in 40**. Recall is secondary.
- **Browser** (Playwright):
  - Memory dialog: About you, pause, delete all with confirm.
  - Temporary chat switch and label.
  - No memory UI appears in answers.
  - Phone width.
- **Production check after deploy:** a read-only script for the tables and grants, plus one manual round in the owner's account: state a fact, ask a question that should use it, then say "forget that…". The owner deletes any test data.

## Boundaries

- **Always:**
  - Keep memory out of planner input and search queries.
  - Keep memory text out of logs and telemetry.
  - Extract only from the user's own message.
  - Run `pnpm check` and the memory e2e suite before a PR.
  - Update the privacy docs with the change.
- **Ask first:**
  - Running the production migration.
  - Merging and deploying.
  - Running the paid live eval.
  - Changing the extraction model, the gate, or the 50, 200 and 2,000 limits.
- **Never:**
  - Save memories from web pages, files or answers.
  - Save the sensitive categories.
  - Show a memory list, a "Saved to memory" or "Memory used" note, or let answers mention memory (decided by the user).
  - Delete user data in production as part of testing.

## Success criteria

1. **Saves:** after "I'm a civil engineer in Pune, what's the M25 mix ratio?", the user's memories contain a civil engineer and a Pune entry, and no notice appeared.
2. **Uses:** a later Web question "concrete suppliers near me" answers with Pune in mind, its search queries contain no memory text, and the answer doesn't mention memory.
3. **Corrects:** "I moved to Bengaluru" replaces the Pune memory, and "forget that I'm a civil engineer" removes that one.
4. **Skips:** "What is the GDP of India?" writes no `memory_extractions` row, and a sensitive or hypothetical message saves nothing.
5. **Pause:** with Pause on, there's no `reader` and no extraction. With it off again, both resume.
6. **Delete all** removes every memory row for the user and returns the count. A repeat returns `0`.
7. **Temporary chat:** no `reader` and no extraction.
8. **Failure:** an extraction failure never fails or delays the answer.
9. **Quality:** the offline eval meets its targets, `pnpm check` passes, and CI is green.
10. **Production:** `db:verify` shows 33 tables with the grants above, storage grows by under 2 MB at 100 users, and Neon stays on the free plan.

## Later (not v1)

- **v2:**
  - Export.
  - `last_used_at`, and expire memories unused for 90 days.
  - Gate for languages beyond English.
  - Slight ranking boost for sources the user prefers.
  - Memory in Deep Research.
- **v3:** recall across past conversations, with embeddings stored as `halfvec`.

## Open questions

1. Should Pause also stop applying **About you**? This spec says no: About you is the user's own instruction and stays until cleared.
2. The first-person gate is English-only in v1. Messages in other languages skip extraction until v2. Is that fine?
3. Memory is on by default for existing users too, explained in the Memory dialog and the privacy page. Is that fine, or should existing users start paused?
4. Where should the **Temporary chat** switch sit: near the mode picker as proposed, or in the account menu as "New temporary chat"?
