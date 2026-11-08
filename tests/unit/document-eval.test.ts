import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { evaluateDocuments, formatDocumentEvaluation } from "../../evals/documents";
import { lexicalVector } from "../helpers/documents";

// The live evaluation's harness, run offline with word-overlap vectors so the scoring itself is tested.
it("scores every strategy on the corpus and formats a report", async () => {
  const pg = new PGlite();
  try {
    const result = await evaluateDocuments(pg, async texts => texts.map(lexicalVector));
    expect(result.scores.map(score => score.strategy)).toEqual(["keyword", "semantic", "hybrid"]);
    const keyword = result.scores.find(score => score.strategy === "keyword")!;
    expect(keyword.byKind.exact.recallAt5).toBeGreaterThanOrEqual(0.8);
    expect(result.similarity.answerableExpected).toHaveLength(14);
    expect(formatDocumentEvaluation(result)).toContain("| hybrid |");
  } finally { await pg.close(); }
}, 60000);
