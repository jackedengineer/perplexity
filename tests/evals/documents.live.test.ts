import { writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { createOpenRouterEmbeddings } from "@/server/documents/embedding";
import { evaluateDocuments, formatDocumentEvaluation } from "../../evals/documents";

// Opt-in: LIVE_DOCUMENT_EVAL=1 OPENROUTER_API_KEY=... pnpm eval:documents
// Embeds about 40 short texts with the production model (well under $0.001). No database or user data.
it("compares keyword, vector and hybrid retrieval on the document corpus", async () => {
  if (process.env.LIVE_DOCUMENT_EVAL !== "1" || !process.env.OPENROUTER_API_KEY) throw new Error("Explicit live document evaluation opt-in required");
  const provider = createOpenRouterEmbeddings(process.env.OPENROUTER_API_KEY);
  const pg = new PGlite();
  try {
    const result = await evaluateDocuments(pg, async texts => (await provider.embed(texts, new AbortController().signal)).vectors);
    const report = formatDocumentEvaluation(result);
    console.log(report);
    await writeFile(".artifacts/document-eval.json", JSON.stringify(result, null, 1));
    expect(result.scores).toHaveLength(3);
  } finally { await pg.close(); }
}, 120000);
