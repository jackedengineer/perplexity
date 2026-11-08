import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { chunkPages } from "@/server/documents/chunk";
import { MIN_SIMILARITY, searchDocuments, type SearchStrategy } from "@/server/documents/retrieve";
import type { AdmissionDatabase } from "@/server/runs/usage";

type Case = { id: string; kind: "exact" | "paraphrase" | "unanswerable"; text: string; expect: [string, number] | null };
type Corpus = { version: string; documents: { title: string; pages: string[] }[]; questions: Case[] };
export type Embed = (texts: string[]) => Promise<number[][]>;
export type StrategyScore = { strategy: SearchStrategy; recallAt1: number; recallAt5: number; mrr: number; falseMatches: number; byKind: Record<string, { recallAt1: number; recallAt5: number }> };
export type DocumentEvaluation = { version: string; questions: number; scores: StrategyScore[];
  similarity: { answerableExpected: number[]; unanswerableTop: number[]; threshold: number } };

export const loadDocumentCorpus = async (): Promise<Corpus> => JSON.parse(await readFile("evals/cases/documents.json", "utf8"));

// Builds the corpus in a fresh database with the real migrations, then scores each search
// strategy on the same questions. `pg` is a PGlite instance with pgvector loaded.
export async function evaluateDocuments(pg: { exec(sql: string): Promise<unknown>; query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }, embed: Embed): Promise<DocumentEvaluation> {
  const corpus = await loadDocumentCorpus();
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
  const db = drizzle(pg as never, { schema }) as unknown as AdmissionDatabase;
  const subject = randomUUID();
  await db.insert(schema.user).values({ id: subject, name: "Evaluation", email: `${subject}@example.test` });
  const [owner] = await db.insert(schema.appUsers).values({ authSubject: subject }).returning();
  for (const [index, document] of corpus.documents.entries()) {
    const chunks = chunkPages(document.pages);
    const vectors = await embed(chunks.map(chunk => `${document.title}, page ${chunk.page}\n${chunk.text}`));
    const [row] = await db.insert(schema.documents).values({ userId: owner.id, title: document.title, contentHash: String(index).padStart(64, "0"), storageKey: `eval/${index}`,
      byteSize: 1, pageCount: document.pages.length, status: "READY", chunkCount: chunks.length, embeddedCount: chunks.length, createdAt: new Date(), updatedAt: new Date() }).returning();
    await db.insert(schema.documentChunks).values(chunks.map((chunk, i) => ({ documentId: row.id, userId: owner.id, ...chunk, embedding: vectors[i], embeddingModel: "evaluation" })));
  }
  const questionVectors = await embed(corpus.questions.map(question => question.text));
  const scores: StrategyScore[] = [];
  for (const strategy of ["keyword", "semantic", "hybrid"] as const) {
    let hit1 = 0, hit5 = 0, reciprocal = 0, falseMatches = 0;
    const kinds: Record<string, { total: number; hit1: number; hit5: number }> = {};
    for (const [index, question] of corpus.questions.entries()) {
      const matches = await searchDocuments(db, owner.id, { text: question.text, vector: questionVectors[index] }, strategy, 5);
      if (!question.expect) { if (matches.length) falseMatches++; continue; }
      const rank = matches.findIndex(match => match.title === question.expect![0] && match.page === question.expect![1]) + 1;
      const kind = kinds[question.kind] ??= { total: 0, hit1: 0, hit5: 0 };
      kind.total++;
      if (rank === 1) { hit1++; kind.hit1++; }
      if (rank >= 1) { hit5++; kind.hit5++; reciprocal += 1 / rank; }
    }
    const answerable = corpus.questions.filter(question => question.expect).length;
    scores.push({ strategy, recallAt1: hit1 / answerable, recallAt5: hit5 / answerable, mrr: reciprocal / answerable, falseMatches,
      byKind: Object.fromEntries(Object.entries(kinds).map(([kind, value]) => [kind, { recallAt1: value.hit1 / value.total, recallAt5: value.hit5 / value.total }])) });
  }
  // Raw cosine similarities, ignoring the threshold, to check where it should sit.
  const answerableExpected: number[] = [], unanswerableTop: number[] = [];
  for (const [index, question] of corpus.questions.entries()) {
    const vector = JSON.stringify(questionVectors[index]);
    const rows = (await db.execute(sql`SELECT d.title, c.page, 1 - (c.embedding <=> ${vector}::vector) AS similarity FROM document_chunks c JOIN documents d ON d.id = c.document_id ORDER BY c.embedding <=> ${vector}::vector`) as unknown as { rows: { title: string; page: number; similarity: number }[] }).rows;
    if (question.expect) answerableExpected.push(Number(rows.find(row => row.title === question.expect![0] && Number(row.page) === question.expect![1])?.similarity ?? 0));
    else unanswerableTop.push(Number(rows[0]?.similarity ?? 0));
  }
  return { version: corpus.version, questions: corpus.questions.length, scores, similarity: { answerableExpected, unanswerableTop, threshold: MIN_SIMILARITY } };
}

export function formatDocumentEvaluation(result: DocumentEvaluation) {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const range = (values: number[]) => values.length ? `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}` : "n/a";
  return [
    `| Strategy | Recall@1 | Recall@5 | MRR | Exact terms R@1 | Paraphrases R@1 | False matches (of ${result.questions - result.similarity.answerableExpected.length}) |`,
    "|---|---|---|---|---|---|---|",
    ...result.scores.map(score => `| ${score.strategy} | ${pct(score.recallAt1)} | ${pct(score.recallAt5)} | ${score.mrr.toFixed(2)} | ${pct(score.byKind.exact?.recallAt1 ?? 0)} | ${pct(score.byKind.paraphrase?.recallAt1 ?? 0)} | ${score.falseMatches} |`),
    "",
    `Cosine similarity of the correct page: ${range(result.similarity.answerableExpected)}. Best match for unanswerable questions: ${range(result.similarity.unanswerableTop)}. Threshold: ${result.similarity.threshold}.`,
  ].join("\n");
}
