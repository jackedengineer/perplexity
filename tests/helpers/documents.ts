import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
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

// A minimal valid PDF whose pages draw `lines` from a Flate-compressed stream, so a tiny
// file can expand into a very large amount of extracted text.
export function compressedTextPdf(lines: string[], pages = 1) {
  // A 0.001pt font fits about a million glyphs on one line; pdf.js drops text past the page edge.
  const stream = deflateSync(Buffer.from(`BT /F1 0.001 Tf 0 700 Td 0.002 TL ${lines.map(line => `(${line}) Tj T*`).join(" ")} ET`));
  const objects: (string | Buffer)[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (let i = 0; i < pages; i++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(Buffer.concat([Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`), stream, Buffer.from("\nendstream")]));
  }
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")], offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((object, index) => {
    const body = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.isBuffer(object) ? object : Buffer.from(object), Buffer.from("\nendobj\n")]);
    offsets.push(length); parts.push(body); length += body.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  return new Uint8Array(Buffer.concat([...parts, Buffer.from(xref)]));
}
