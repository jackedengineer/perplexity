# Memory: answers that fit the person asking

Signed-in users get long-term memory. Perplex quietly learns lasting facts people state about themselves, like their work, city, languages, answer preferences and ongoing projects, and uses them to shape later Chat and Web answers.

Nothing on screen says a memory was saved or used, and there is no list of memories. Memory settings offer only About you, a pause switch and Delete all. Guests have no memory.

The design and its reasons are in [`memory-spec.md`](memory-spec.md). The build plan is in [`tasks/memory-plan.md`](../tasks/memory-plan.md).

## How it works

```text
Question answered (run COMPLETED or NEEDS_CLARIFICATION)
  → execute.ts schedules extractMemories(runId) with after(): the user never waits
  → skip without a model call when any of these hold, writing nothing:
      guest · memory paused · temporary chat · files attached
      · message over 2,000 characters · no first-person word ("I", "my", "we"…)
      · 100 extractions already today
  → claim the run's memory_extractions row (primary key = run id, so once per run)
  → planner model, memory-v1 prompt: the user's own accepted message
      + their saved memories under short ids (m1…), wire cap 16 KB, ≤400 output tokens, 8 s, zero retention
  → at most 3 operations: ADD {kind, text} · UPDATE {id, text} · DELETE {id}
  → free checks drop each bad operation on its own:
      foreign or repeated id · sensitive (contacts, ID numbers, links, health, religion, politics,
      sexuality, ethnicity, money, credentials, addresses) · ungrounded (<60% of content words are the user's)
  → write under a lock on the user's memory_settings row; re-check pause; skip duplicates;
      past 50, evict the oldest CONTEXT memory, then the oldest of any kind
  → finish the ledger row: status, cost, operations applied. Failures are recorded and swallowed.

Next question
  → complete.ts loads the reader: About you, then PREFERENCE, PROFILE and CONTEXT memories, newest first, ≤2,000 characters
      (absent for guests, paused memory and temporary chats)
  → answer-v11 / chat-v3 prompts get it as `reader`, with a rule sent only when there is a reader:
      use it for tone, depth, format, units, language and resolving references; never cite it; never mention memory
  → over the 20 KB packet budget, memories are dropped (least important first), then About you, before any evidence or history
  → the planner and search never see it
```

## Data

| Table | Holds | Web role can |
|---|---|---|
| `memories` | `kind`, `text` (3–200 characters), optional `source_message_id`, timestamps. Unique per user, ignoring case and spaces | select, insert, delete; update only `kind`, `text`, `updated_at` |
| `memory_settings` | `paused`, `instructions` (About you, at most 1,000 characters) | select, insert; update only `paused`, `instructions`, `updated_at` |
| `memory_extractions` | One row per run: status, model, cost, number of operations applied. No memory text | select, insert; update only the outcome columns |
| `conversations.memory_enabled` | False for a temporary chat, fixed at creation | (existing grants) |

Migration `0042_memory.sql` creates these and grants them to `perplex_web`.

Extraction cost is recorded apart from the run, the same way document embedding cost is. Under budget version 2, a run's stage caps already use 49,850 of its 50,000 µUSD reserve, so a memory claim inside the run could starve its output check.

## API

- `GET /api/memory` returns `{ data: { paused, instructions } }`.
- `PATCH /api/memory` takes `{ paused?, instructions? }` as a strict, same-origin, rate-limited JSON body of at most 4 KB.
- `DELETE /api/memory` returns `{ data: { deleted } }`. It is idempotent.
- Guests and signed-out requests get 401.
- No endpoint returns memory text.

`POST /api/conversations` accepts `memory: false` to start a temporary chat. The choice is part of the creation fingerprint, so a replay can't flip it.

## Privacy

- **Conversation deletion:** memories survive it (the source link is cleared).
- **Delete all memories:** removes them permanently.
- **Account deletion:** cascades to memories and settings.
- **Logs:** carry counts and reasons only (`memory.extraction`, `memory.settings`, `memory.delete_all`), never memory text.
- **Public notice:** the privacy page describes all of this.

## Checks

```bash
pnpm check                      # unit, integration (PGlite) and the offline memory eval
LIVE_NEON_E2E=1 pnpm exec playwright test --config playwright.memory.config.ts   # browser, development Neon, synthetic providers
pnpm eval:memory                # live extraction eval on the real planner model; paid, opt-in only
```

The offline eval (`evals/memory-cases.json`) has 40 labelled messages with hand-written replies that include typical model mistakes. Its targets are 0 sensitive saves, 0 ungrounded saves and at most 1 wrong case. The current result is 40 of 40, with 34 model calls and 6 messages skipped by the gate.

## Not in v1

- Export.
- Expiring unused memories (needs `last_used_at`).
- A first-person gate for languages other than English.
- A ranking boost for preferred sources.
- Memory in Deep Research.
- Recall across past conversations.
