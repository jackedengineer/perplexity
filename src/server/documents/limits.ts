// Server-owned limits for private documents. The browser shows some of these values; it never sets them.
export const DOCUMENT_LIMITS = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  maxPages: 300,
  maxDocuments: 20,
  // Extraction stops as soon as a page or the whole file passes these, so a small file
  // that expands into a huge amount of text costs little work before it is refused.
  // A dense printed page holds about 3,000-5,000 characters.
  maxPageCharacters: 20_000,
  maxCharacters: 1_500_000,
  // Accepted characters per user per UTC day, counted at upload and never refunded by a
  // delete. Bounds one account's embedding spend to about $0.03 a day.
  dailyCharacters: 1_500_000,
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
  // Embedding never takes the operator budget below this, so uploads can't pause research.
  // Twice the 50,000 microUSD a research run reserves.
  operatorFloorMicroUsd: 100_000n,
  uploadReadMs: 30_000,
});

export class DocumentError extends Error {
  constructor(readonly code: "DOCUMENT_UNSUPPORTED" | "DOCUMENT_TOO_LARGE" | "DOCUMENT_UNREADABLE" | "DOCUMENT_LIMIT_REACHED" | "DOCUMENT_DAILY_LIMIT") {
    super("Document rejected");
  }
}
