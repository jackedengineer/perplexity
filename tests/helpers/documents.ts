import { readFile } from "node:fs/promises";
import { DOCUMENT_EMBEDDING_DIMENSIONS } from "@/db/document-schema";
import type { EmbeddingProvider } from "@/server/documents/embedding";

export const fixturePdf = async (name: string) => new Uint8Array(await readFile(`tests/fixtures/documents/${name}.pdf`));

// Deterministic bag-of-words vectors: texts that share words point in similar directions,
// so retrieval behaves sensibly without a paid model.
export function lexicalVector(text: string) {
  const vector = new Array<number>(DOCUMENT_EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (word.length < 3) continue;
    let hash = 2166136261;
    for (const character of word) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
    vector[Math.abs(hash) % DOCUMENT_EMBEDDING_DIMENSIONS] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map(value => value / norm);
}

export function fakeEmbeddings(options: { costMicroUsd?: bigint | null; fail?: boolean } = {}): EmbeddingProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    modelId: "openai/text-embedding-3-small", calls,
    async embed(texts) {
      calls.push(texts);
      if (options.fail) throw new Error("Synthetic embedding outage");
      return { vectors: texts.map(lexicalVector), costMicroUsd: options.costMicroUsd === undefined ? 5n : options.costMicroUsd, model: "openai/text-embedding-3-small" };
    },
  };
}
