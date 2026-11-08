// Server-owned limits for private documents. The browser shows these values; it never sets them.
export const DOCUMENT_LIMITS = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  maxPages: 300,
  maxDocuments: 20,
  maxChunks: 3000,
  maxTitleCharacters: 200,
  // A chunk must fit one evidence passage (1,000 characters) with room to spare.
  chunkCharacters: 900,
  chunkOverlapCharacters: 150,
  // Fewer characters than this per page means the PDF is probably scanned images.
  minimumCharactersPerPage: 20,
  embeddingBatchSize: 64,
  embeddingAttempts: 5,
  embeddingLeaseMs: 60_000,
  uploadReadMs: 30_000,
});

export class DocumentError extends Error {
  constructor(readonly code: "DOCUMENT_UNSUPPORTED" | "DOCUMENT_TOO_LARGE" | "DOCUMENT_UNREADABLE" | "DOCUMENT_LIMIT_REACHED") {
    super("Document rejected");
  }
}
