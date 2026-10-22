# Private conversations: implementation contract

Scope: create, list, load and rename private conversation metadata; bounded approved history reads; persistent recent-conversation navigation. AI generation/admission and public sharing remain later milestones.

## Ownership and persistence

- An application UUID profile maps uniquely to the verified Better Auth subject. The server derives that subject from the database-backed session; request bodies never accept owner IDs.
- Conversation creation uses an owner-scoped client UUID and immutable normalized-title fingerprint. Repeated matching intents return the original conversation; mismatched reuse is rejected. A title is optional metadata, not an accepted AI prompt/message.
- All conversation and history queries join through the application profile and include the auth subject. Missing and foreign resources both return the same 404. Responses exclude owner IDs, fingerprints and draft data.
- Lists use keyset pagination by `(updatedAt, id)` and a maximum of 50 items. Renames use an expected revision to reject stale writes. Read responses are private/no-store.
- Messages have unique per-conversation sequence numbers and structured, versioned text parts. History reads exclude unapproved assistant drafts. No public endpoint writes messages before input/output safety gates exist.
- Migrations are additive. The restricted runtime role gets explicit DML grants on the new tables; the migration owner remains separate. Runtime deletion/purge and active-run fencing stay with their planned lifecycle milestone.

## HTTP contract

| Endpoint | Input | Result |
| --- | --- | --- |
| `POST /api/conversations` | strict `{clientRequestId, title?}`; ≤2 KB JSON | 201 new / 200 replay; public conversation metadata |
| `GET /api/conversations` | validated `cursor`, `limit`, optional literal title search `q` | owner-only bounded items and next cursor |
| `GET /api/conversations/:id` | UUID | metadata plus most recent approved message page |
| `GET /api/conversations/:id/messages` | validated sequence cursor and limit | owner-only approved history |
| `PATCH /api/conversations/:id` | strict `{title, expectedRevision}` | updated metadata or 409 stale revision/active research |

Mutations require an exact trusted Origin and JSON content type. A streaming byte cap precedes JSON parsing. Error bodies have fixed codes/messages and request IDs: 400 malformed, 401 signed out, 403 origin, 404 unavailable, 409 conflict, 413 oversize, 415 media type, 422 validation, 503 database/auth failure. Logs omit titles, history, cookies and query strings.

## UI reference scope

Inspected the current signed-in Perplexity site in the browser on 2026-10-22: home, filled composer, search/model/attachment menus, research progress, saved answer, thread action menu, rename dialog, library and filtered/empty search. Neutral rainbow query used for the thread reference; personal history is not copied into the application.

Observed: 240 px sidebar, dark canvas/sidebar/surface hierarchy, compact sans typography (24/32 px home heading), 16/24 px composer text, approximately 120 px two-row composer, 16 px composer corners, 56 px thread/library header, subtle outline buttons and bottom-pinned account controls. Reference images and computed layout measurements are local ignored review evidence in `.artifacts/reference/`.

The implemented screens will match that workspace geometry, dark palette, density, menus and interaction patterns while retaining the application's Perplex identity. Composer copy describes creating a named private conversation. Model, attachment, voice, Computer and sharing capabilities are not presented as working features. Proprietary `pplxSans` and inaccessible/uninspected viewport states cannot be claimed pixel-identical; visual comparison records actual coverage.

## Verification slices

1. PostgreSQL schema/constraints and owner-scoped repositories: two-user isolation, idempotency, stale rename, pagination, draft filtering and cascade tests.
2. HTTP routes: actual authenticated/expired/revoked sessions, foreign IDs, forged owner fields, origin/type/body-size failures, safe errors and no-store responses.
3. Responsive workspace: create/reload/list/rename/reopen; keyboard menus/dialog focus, loading/empty/not-found/error states; desktop/mobile browser and axe checks.
4. Development Neon migration/runtime privileges and two-user live browser/API checks. Production build and updated frontend performance budget. Focused commits after verified slices.
