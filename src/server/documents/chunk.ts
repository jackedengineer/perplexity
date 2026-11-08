import { DOCUMENT_LIMITS } from "./limits";

export type DocumentChunk = { ordinal: number; page: number; text: string };
type Unit = { text: string; separator: " " | "\n" };

// Sentences within a line join with a space; separate lines keep their line break.
function units(page: string): Unit[] {
  return page.split("\n").flatMap(line => line.split(/(?<=[.!?])\s+/u).filter(Boolean)
    .map((text, index) => ({ text, separator: index === 0 ? "\n" as const : " " as const })));
}

// Splits one overlong unit at whitespace where possible, never mid-surrogate. Linear in the
// unit's length: the code points are materialised once and walked with an index.
function pieces(text: string, size: number) {
  const points = [...text], result: string[] = [];
  let start = 0;
  while (points.length - start > size) {
    let cut = start + size;
    for (let i = start + size - 1; i > start + size / 2; i--) if (points[i] === " ") { cut = i; break; }
    const piece = points.slice(start, cut).join("").trim();
    if (piece) result.push(piece);
    start = cut;
    while (start < points.length && points[start] === " ") start++;
  }
  const rest = points.slice(start).join("").trim();
  if (rest) result.push(rest);
  return result;
}

const joined = (parts: Unit[]) => parts.map((unit, index) => (index === 0 ? "" : unit.separator) + unit.text).join("");

// Page-scoped chunks with a small overlap, so a fact split across a boundary is still
// retrievable and every chunk cites exactly one page.
export function chunkPages(pages: string[], size: number = DOCUMENT_LIMITS.chunkCharacters, overlap: number = DOCUMENT_LIMITS.chunkOverlapCharacters): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  pages.forEach((pageText, index) => {
    const page = index + 1;
    let current: Unit[] = [], length = 0;
    const flush = () => {
      const text = joined(current).trim();
      if (text) chunks.push({ ordinal: chunks.length, page, text });
    };
    for (const unit of units(pageText).flatMap(unit => pieces(unit.text, size).map((text, i) => ({ text, separator: i === 0 ? unit.separator : " " as const })))) {
      if (current.length && length + 1 + unit.text.length > size) {
        flush();
        // Carry trailing units up to the overlap budget into the next chunk.
        const carried: Unit[] = [];
        let carriedLength = 0;
        for (let i = current.length - 1; i >= 0; i--) {
          if (carriedLength + current[i].text.length + (carried.length ? 1 : 0) > overlap) break;
          carriedLength += current[i].text.length + (carried.length ? 1 : 0);
          carried.unshift(current[i]);
        }
        // Overlap never pushes a chunk past its size limit.
        current = carriedLength + 1 + unit.text.length > size ? [] : carried;
        length = current.length ? carriedLength : 0;
      }
      length += (current.length ? 1 : 0) + unit.text.length;
      current.push(unit);
    }
    flush();
  });
  return chunks;
}
