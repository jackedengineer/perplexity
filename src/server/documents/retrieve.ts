import { sql } from "drizzle-orm";
import type { AdmissionDatabase } from "@/server/runs/usage";
import { canonicalSourceUrl } from "@/server/search/evidence";
import { RETRIEVAL_LIMITS } from "@/server/search/limits";
import type { RankedResult } from "@/server/search/rank";
import type { EmbeddingProvider } from "./embedding";

export type SearchStrategy = "hybrid" | "semantic" | "keyword";
export type DocumentMatch = { chunkId: string; documentId: string; page: number; text: string; title: string; score: number; similarity: number | null };

// Candidates per signal before fusion, and the fusion constant from the Reciprocal Rank Fusion paper.
const CANDIDATES = 20, RRF_K = 60;
// Opening chunks of each attached file that are always candidates.
const LEAD_CHUNKS = 2;
// Below this cosine similarity a chunk only counts if its words also match. On the
// `pnpm eval:documents` corpus the correct page scored 0.37-0.67 and unrelated questions at most 0.12.
export const MIN_SIMILARITY = 0.25;
const DOCUMENT_LINK_ORIGIN = "https://perplexity.jacked.dev";

// Words for the keyword query, OR-ed so a natural question still matches. Only letters
// and digits reach to_tsquery, so user text can't inject query syntax.
export function keywordTerms(text: string) {
  return [...new Set(text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(0, 24);
}

// Hybrid retrieval over one owner's READY documents. Ownership is enforced in SQL, not by the caller.
// With documentIds the search is scoped to those files, and each file's opening chunks join
// the fusion as a third ranked list, so "summarize this" still finds the file's opening.
export async function searchDocuments(db: AdmissionDatabase, ownerId: string, query: { text: string; vector: number[] | null }, strategy: SearchStrategy = "hybrid", limit = 12, documentIds?: readonly string[]): Promise<DocumentMatch[]> {
  const terms = strategy === "semantic" ? [] : keywordTerms(query.text);
  const vector = strategy === "keyword" || !query.vector ? null : JSON.stringify(query.vector);
  const scoped = Boolean(documentIds?.length);
  if (!terms.length && !vector && !scoped) return [];
  const tsquery = terms.join(" | ");
  const scope = scoped ? sql`AND c.document_id IN (${sql.join(documentIds!.map(id => sql`${id}::uuid`), sql`, `)})` : sql``;
  type Row = { chunk_id: string; document_id: string; page: number; text: string; title: string; score: number | string; similarity: number | string | null };
  // Both Postgres drivers in use (pg on Workers and Node, PGlite in tests) return `{ rows }`.
  const result = await db.execute(sql`
    WITH semantic AS (
      SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> ${vector}::vector) AS rank, 1 - (c.embedding <=> ${vector}::vector) AS similarity
      FROM document_chunks c JOIN documents d ON d.id = c.document_id AND d.user_id = c.user_id
      WHERE ${vector}::text IS NOT NULL AND c.user_id = ${ownerId} AND d.status = 'READY' AND c.embedding IS NOT NULL ${scope}
      ORDER BY c.embedding <=> ${vector}::vector LIMIT ${CANDIDATES}
    ), keyword AS (
      SELECT c.id, row_number() OVER (ORDER BY ts_rank_cd(c.search_text, q) DESC) AS rank
      FROM document_chunks c JOIN documents d ON d.id = c.document_id AND d.user_id = c.user_id, to_tsquery('english', ${tsquery}) q
      WHERE ${tsquery} <> '' AND c.user_id = ${ownerId} AND d.status = 'READY' AND c.search_text @@ q ${scope}
      ORDER BY ts_rank_cd(c.search_text, q) DESC LIMIT ${CANDIDATES}
    ), lead AS (
      SELECT c.id, row_number() OVER (ORDER BY c.ordinal, c.document_id) AS rank
      FROM document_chunks c JOIN documents d ON d.id = c.document_id AND d.user_id = c.user_id
      WHERE ${scoped} AND c.user_id = ${ownerId} AND d.status = 'READY' AND c.ordinal < ${LEAD_CHUNKS} ${scope}
    )
    SELECT c.id AS chunk_id, c.document_id, c.page, c.text, d.title, s.similarity,
      coalesce(1.0 / (${RRF_K} + s.rank), 0) + coalesce(1.0 / (${RRF_K} + k.rank), 0) + coalesce(1.0 / (${RRF_K} + l.rank), 0) AS score
    FROM document_chunks c JOIN documents d ON d.id = c.document_id AND d.user_id = c.user_id
    LEFT JOIN semantic s ON s.id = c.id LEFT JOIN keyword k ON k.id = c.id LEFT JOIN lead l ON l.id = c.id
    WHERE c.user_id = ${ownerId} ${scope} AND ((s.id IS NOT NULL AND s.similarity >= ${MIN_SIMILARITY}) OR k.id IS NOT NULL OR l.id IS NOT NULL)
    ORDER BY score DESC, c.document_id, c.ordinal
    LIMIT ${limit}`) as unknown as { rows: Row[] };
  return result.rows.map(row => ({ chunkId: row.chunk_id, documentId: row.document_id, page: Number(row.page), text: row.text, title: row.title,
    score: Number(row.score), similarity: row.similarity === null ? null : Number(row.similarity) }));
}

// A citation link to the exact page. The page is in the query because source links drop fragments.
export function documentPageUrl(documentId: string, page: number) {
  return `${DOCUMENT_LINK_ORIGIN}/documents/${documentId}?page=${page}`;
}

// A token is at least one UTF-8 byte, so 4,000 bytes stay under the query embedding's
// 100 microUSD cap (5,000 tokens) whatever the language. Truncates on a code point.
export function boundedQuestion(text: string, maxBytes = 4000) {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let result = "", bytes = 0;
  for (const character of text) {
    const size = encoder.encode(character).length;
    if (bytes + size > maxBytes) break;
    result += character; bytes += size;
  }
  return result;
}

export type DocumentFinder = {
  readonly modelId: string;
  find(input: { ownerId: string; question: string; queries: string[]; documentIds?: readonly string[] }, options: { signal: AbortSignal }): Promise<RankedResult[]>;
};

// Turns matches into the same result shape web search produces, best chunk per page first,
// so evidence building, safety checks and citations are shared with Web mode.
export function createDocumentFinder(db: AdmissionDatabase, embedder: EmbeddingProvider): DocumentFinder {
  return {
    modelId: embedder.modelId,
    async find({ ownerId, question, queries, documentIds }, options) {
      const { vectors: [vector] } = await embedder.embed([boundedQuestion(question)], options.signal);
      const matches = await searchDocuments(db, ownerId, { text: [question, ...queries].join(" "), vector }, "hybrid", 12, documentIds);
      const seen = new Set<string>(), results: RankedResult[] = [], retrievedAt = new Date().toISOString();
      for (const match of matches) {
        const url = canonicalSourceUrl(documentPageUrl(match.documentId, match.page));
        if (!url || seen.has(url)) continue;
        seen.add(url);
        results.push({ title: `${[...match.title].slice(0, 280).join("")}, page ${match.page}`, url, content: match.text, score: match.score,
          contentKind: "DOCUMENT_PAGE", retrievedAt });
        if (results.length === RETRIEVAL_LIMITS.results * 2) break;
      }
      return results;
    },
  };
}
