# Files: questions about your own PDFs

Signed-in users upload PDFs and ask questions about them in **Files** mode. Answers cite the file and page, and the citation opens the PDF at that page. Files stay private to their owner.

## How it works

```text
Upload  POST /api/documents (raw PDF)
  → check owner, origin, rate limit, size, PDF header
  → parse with unpdf, page by page          (rejects scans, encryption, >300 pages)
  → chunk: ≤900 characters, never across a page, small overlap
  → store the original in R2, write documents + document_chunks (PROCESSING)
  → after the response: embed chunks (openai/text-embedding-3-small via OpenRouter, zero retention)
  → READY once every chunk has a vector       (scheduled backstop every minute)

Question in Files mode
  → same admission, input check and planner as Web mode
  → embed the question                        (provider ledger stage QUERY_EMBEDDING, cap 100 µUSD)
  → one SQL query over the asker's READY chunks:
      pgvector cosine top 20 + Postgres full-text top 20, fused with Reciprocal Rank Fusion
  → best chunk per page becomes evidence, linked to /documents/<id>?page=N
  → same evidence check, answer, citation validation, output check and settlement as Web mode
```

Files mode is a third `runs.mode` (`DOCUMENTS`). Only the search step differs from Web mode: no query leaves the server, no Tavily credits are spent, and the retrieval row records `source_kind = 'DOCUMENTS'`.

## API

| Method | Path | Result |
|---|---|---|
| `GET` | `/api/documents` | `{ data: Document[], limits }`. Unpaginated because of the 20-file quota |
| `POST` | `/api/documents` | Body is the PDF (`Content-Type: application/pdf`), name in `X-File-Name`. `201` when created, `200` for an identical file already uploaded |
| `DELETE` | `/api/documents/:id` | `204`. Idempotent; another user's ID also returns `204` and changes nothing |
| `GET` | `/api/documents/:id/file` | The original PDF, owner only |
| `GET` | `/documents/:id?page=N` | Redirects to the file at `#page=N`; this is the citation link |

Errors use the shared `{ error: { code, message }, requestId }` shape. New codes: `DOCUMENT_UNSUPPORTED` (415), `DOCUMENT_TOO_LARGE` (413), `DOCUMENT_UNREADABLE` (422), `DOCUMENT_LIMIT_REACHED` (409). Guests get `UNAUTHENTICATED`.

## Limits

20 files per user, 10 MB and 300 pages per file, 3,000 chunks per file, 10 uploads a minute and 60 a day. Text-based PDFs only: scanned and password-protected files are rejected at upload.

## Cost and budget

Embedding costs $0.02 per million tokens; a 100-page report costs roughly $0.001. Each embedding batch reserves its worst-case cost (bytes × 0.02 µUSD) from the operator period and day before calling the provider, then refunds the unused part. An unknown outcome stays charged. Uploads are refused while research is paused for budget. A Files question costs the same as a Web question minus the Tavily search.

## Security and privacy

- Ownership is enforced in SQL: chunks carry the owner and a composite foreign key to their document, and search filters on the owner inside the query.
- Deleting a document removes its chunks and the stored file. Deleting an account cascades to its documents; the R2 objects of a deleted account are not removed automatically.
- Document text is untrusted. Evidence validation drops chunks containing markup or prompt-injection phrases (the hidden-instruction fixture's page never reaches the model), and the evidence and output checks still run. A paraphrased injection would not be caught by that filter; the answer prompt treats evidence as data.
- Embedding calls use OpenRouter's zero-data-retention routing with no fallbacks, like the other model calls.
- File titles are display text only: paths and control characters are stripped. Storage keys are server-generated.

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

- **Feature flag:** `ENABLE_DOCUMENTS=true` (a plain Worker variable). Off hides Files mode, returns `404` from the API and skips the scheduled backstop.
- **Storage:** R2 bucket bound as `DOCUMENTS_BUCKET`. On Node, `DOCUMENT_STORE_DIR` points at a local folder for development and browser tests.
- **Database:** migration `0038_document_rag` installs `pgvector`, adds the two tables and their grants, and extends the run, retrieval, passage and provider-call constraints. It is additive: existing rows are unaffected.
- **Rollback:** set `ENABLE_DOCUMENTS` to anything else and redeploy, or restore the previous Worker version. Keep the migration; older code ignores the new tables and mode.
- **Logs:** `documents.upload` (outcome, pages, duration) and `documents.embedding` (embedded, failed). No file names or text are logged.

## Tests

- Unit: parsing, chunking, titles, embedding client, cost bounds (`tests/unit/document-ingest.test.ts`).
- Integration on the real migrations with pgvector: storage rules, upload, dedupe, quota, budget, retries, ownership, HTTP contract (`tests/integration/documents.test.ts`, `document-schema.test.ts`), and Files runs end to end (`document-retrieval.test.ts`).
- Browser, desktop and phone, on development Neon with synthetic providers: `LIVE_NEON_E2E=1 pnpm exec playwright test --config playwright.documents.config.ts`.
- PDF fixtures are generated by `tests/fixtures/documents/generate.mjs`.
