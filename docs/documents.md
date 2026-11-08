# Files: questions about your own PDFs

Signed-in users attach PDFs to any **Chat** or **Web** question: with the paperclip, by dropping files anywhere on the page, or by pasting them. Answers cite the file and page, and the citation opens the PDF at that page. Files stay private to their owner.

Files are a feature of a question, not a mode. Chat with files answers only from those files; Web with files searches the web and the files together. Attached files stay on follow-ups in the same conversation until the user removes them, and each saved question lists the files it was asked with. Deep Research doesn't read files yet, so its composer hides them.

## How it works

```text
Upload  POST /api/documents (raw PDF)
  → check owner, origin, rate limit, size, PDF header
  → check today's upload allowance
  → parse with unpdf, streamed page by page  (stops early past 20,000 characters a page or 1.5M a file;
                                              rejects scans, encryption, >300 pages)
  → chunk: ≤900 characters, never across a page, small overlap
  → store the original in R2, write documents + document_chunks (PROCESSING)
  → after the response: embed chunks (openai/text-embedding-3-small via OpenRouter, zero retention)
  → READY once every chunk has a vector       (scheduled backstop every minute)

Question with attached files  (submission carries documentIds, at most 5)
  → admission checks each file is the asker's and READY (else DOCUMENT_NOT_READY), records run_documents
  → Chat + files runs as DOCUMENTS; Web + files runs as FAST and also searches the files
  → planner sees the file names, so "this report" resolves to them and it never asks which file
  → embed the question                        (provider ledger stage QUERY_EMBEDDING, cap 100 µUSD)
  → one SQL query over the attached files' READY chunks:
      pgvector cosine top 20 + Postgres full-text top 20 + each file's opening chunks,
      fused with Reciprocal Rank Fusion (the opening chunks let "Summarize this" find something)
  → Web + files: file pages and web results alternate, at most 3 file pages of the 5 evidence slots
  → best chunk per page becomes evidence, linked to /documents/<id>?page=N
  → same evidence check, answer, citation validation, output check and settlement as Web mode
```

A Chat question with files is stored as `runs.mode = 'DOCUMENTS'`: no query leaves the server, no Tavily credits are spent, and the retrieval row records `source_kind = 'DOCUMENTS'`. A Web question with files keeps `FAST` and `source_kind = 'WEB'`, because it spends search credits; its file pages are `DOCUMENT_PAGE` passages, and `run_documents` records which files it used. A failed file search fails the run rather than answering from the web alone. A Web question with no topic of its own ("Summarize this") searches only the files. Search queries use only the user's own words, so a file's name never reaches web search unless the user typed it. Deleting a file while a question about it is running fails that run with `DOCUMENT_NOT_READY` instead of searching other files; the attachment row stays with no file. A `DOCUMENTS` submission without `documentIds` (from clients before attachments) still searches all of the asker's files.

## API

| Method | Path | Result |
|---|---|---|
| `GET` | `/api/documents` | `{ data: Document[], limits }`. Unpaginated because of the 20-file quota |
| `POST` | `/api/documents` | Body is the PDF (`Content-Type: application/pdf`), name in `X-File-Name`. `201` when created, `200` for an identical file already uploaded |
| `DELETE` | `/api/documents/:id` | `204`. Idempotent; another user's ID also returns `204` and changes nothing |
| `GET` | `/api/documents/:id/file` | The original PDF, owner only |
| `GET` | `/documents/:id?page=N` | Redirects to the file at `#page=N`; this is the citation link |
| `POST` | `/api/chat` | The submission gains optional `documentIds` (1–5 unique IDs). They are part of the idempotency fingerprint, so the same request key with a different file list is `IDEMPOTENCY_MISMATCH` |
| `GET` | conversation history | A question asked with files carries `attachments: [{ id, title }]`; a deleted file drops out |

Errors use the shared `{ error: { code, message }, requestId }` shape. New codes: `DOCUMENT_UNSUPPORTED` (415), `DOCUMENT_TOO_LARGE` (413), `DOCUMENT_UNREADABLE` (422), `DOCUMENT_LIMIT_REACHED` (409), `DOCUMENT_DAILY_LIMIT` (429), `DOCUMENT_NOT_READY` (409, an attached file is still preparing, was deleted or isn't the asker's). Guests get `UNAUTHENTICATED`.

## Limits

20 files per user, 10 MB, 300 pages and 1.5 million extracted characters per file (20,000 per page), 10 uploads a minute and 60 a day on their own rate-limit bucket. Each user may add 1.5 million characters a day; the count is kept when a file is deleted, so deleting and re-uploading can't get around it. Text-based PDFs only: scanned and password-protected files are rejected at upload.

## Cost and budget

Embedding costs $0.02 per million tokens; a 100-page report costs roughly $0.001, and the daily allowance bounds one account to about $0.03 a day even for token-dense text. Each embedding batch reserves its worst-case cost (bytes × 0.02 µUSD) from the operator period and day before calling the provider, and only if at least $0.10 would remain, so uploads can never pause research. The real cost then replaces the reservation, even if it is higher. An unknown outcome stays charged. Uploads are refused while research is paused for budget.

A Files question costs the same as a Web question minus the Tavily search. Its embedding is capped at 100 µUSD, and the question is truncated to 4,000 UTF-8 bytes before embedding so no language can exceed that cap.

## Security and privacy

- Ownership is enforced in SQL: chunks carry the owner and a composite foreign key to their document, and search filters on the owner inside the query.
- Deleting a document removes its chunks and the stored file. Deleting an account cascades to its documents; the R2 objects of a deleted account are not removed automatically.
- Document text is untrusted. Evidence validation drops chunks containing markup or prompt-injection phrases (the hidden-instruction fixture's page never reaches the model), and the evidence and output checks still run. A paraphrased injection would not be caught by that filter; the answer prompt treats evidence as data.
- Embedding calls use OpenRouter's zero-data-retention routing with no fallbacks, like the other model calls.
- File titles are display text only: paths and control characters are stripped. Storage keys are server-generated.
- The runtime role can update only the status, count and cost columns of `documents` and the embedding and lease columns of `document_chunks`.

**Residual risks.** Parsing runs inside the request Worker, so a hostile PDF that is expensive to decompress or lay out can still use a request's CPU before the character budget trips; the per-user rate limit bounds how often. The original files of an account deleted by cascade remain in R2, and an R2 write that succeeds just before a failed database commit leaves an orphan; neither is swept yet. Citation links always name the production host.

## Retrieval quality

`pnpm eval:documents` (opt-in, needs `OPENROUTER_API_KEY`) embeds the authored corpus in `evals/cases/documents.json` with the production model and scores each strategy. Results on 8 November 2026, 14 answerable and 4 unanswerable questions:

| Strategy | Recall@1 | Recall@5 | MRR | Exact terms R@1 | Paraphrases R@1 | False matches (of 4) |
|---|---|---|---|---|---|---|
| keyword | 64% | 86% | 0.75 | 100% | 38% | 1 |
| semantic | 100% | 100% | 1.00 | 100% | 100% | 1 |
| hybrid | 93% | 100% | 0.96 | 100% | 88% | 1 |

The correct page scored 0.37–0.67 cosine similarity; unrelated questions scored at most 0.12, so the 0.25 threshold sits in the gap. The one false match is a question naming the vendor, which retrieves that vendor's contract.

Hybrid is kept even though vector-only ranked better here. Answers use up to five pages, so Recall@5 is what reaches the model, and both score 100%. Keyword search protects rare identifiers and codes, which embeddings handle poorly and this small corpus doesn't stress. Down-weighting keyword matches to 0.5 did not change the result. The corpus is small and authored, so treat these numbers as a regression baseline, not a benchmark.

## Operating it

- **Feature flag:** `ENABLE_DOCUMENTS=true` (a plain Worker variable). Off hides the paperclip and drop target, returns `404` from the API and skips the scheduled backstop.
- **Storage:** R2 bucket bound as `DOCUMENTS_BUCKET`. On Node, `DOCUMENT_STORE_DIR` points at a local folder for development and browser tests.
- **Database:** migration `0038_document_rag` installs `pgvector`, adds the two tables and their grants, and extends the run, retrieval, passage and provider-call constraints. It is additive: existing rows are unaffected.
- **Rollback:** set `ENABLE_DOCUMENTS` to anything else and redeploy. **Don't restore a Worker version from before this feature once a Files answer exists**: older code rejects `DOCUMENT_PAGE` sources, so every conversation containing a Files answer would fail to load. Keep the migrations.
- **Attachments migrations:** `0040_file_attachments` adds `run_documents` (run, file, owner, position) and grants the app `SELECT, INSERT` only; `0041_attachment_deletes` makes a deleted file null its `document_id` instead of removing the row. Additive; older Worker versions ignore it, so rolling back the attachment UI is a normal redeploy.
- **Logs:** `documents.upload` (outcome, pages, duration) and `documents.embedding` (embedded, failed). No file names or text are logged.

## Review

An independent review before launch found, and this branch fixes with regression tests: one account draining the shared budget through uploads; a tiny PDF expanding into millions of characters; a query embedding over its cap leaving a run unsettled; documents stuck in PROCESSING after a killed worker; a late worker double-counting vectors; uploads sharing the chat rate limit; unsafe version rollback; bucket lock ordering; broad runtime grants; and dialog focus and announcements.

## Tests

- Unit: parsing, chunking, titles, embedding client, cost bounds (`tests/unit/document-ingest.test.ts`).
- Integration on the real migrations with pgvector: storage rules, upload, dedupe, quota, budget, retries, ownership, HTTP contract (`tests/integration/documents.test.ts`, `document-schema.test.ts`), and Files runs end to end (`document-retrieval.test.ts`).
- Browser, desktop and phone, on development Neon with synthetic providers: `LIVE_NEON_E2E=1 pnpm exec playwright test --config playwright.documents.config.ts`.
- PDF fixtures are generated by `tests/fixtures/documents/generate.mjs`.
- Attachments: scoping to the attached files, Web + files mixing and credits, refusals, history, idempotency (`tests/integration/attachments.test.ts`); planner rules with files and result mixing (`tests/unit/attachment-planning.test.ts`); paperclip and drag-and-drop, chips, follow-ups, Manage files and phone layout with a worst-case file name (`tests/e2e/documents.spec.ts`).
