import { DOCUMENT_LIMITS } from "./limits";

export type DocumentChunk = { ordinal: number; page: number; text: string };
type Unit = { text: string; separator: " " | "\n" };

// Sentences within a line join with a space; separate lines keep their line break.
function units(page: string): Unit[] {
  return page.split("\n").flatMap(line => line.split(/(?<=[.!?])\s+/u).filter(Boolean)
    .map((text, index) => ({ text, separator: index === 0 ? "\n" as const : " " as const })));
}

// Splits one overlong unit at whitespace where possible, never mid-surrogate.
function pieces(text: string, size: number) {
  const result: string[] = [];
  let rest = text;
  while ([...rest].length > size) {
    const window = [...rest].slice(0, size).join("");
    const cut = window.lastIndexOf(" ") > size / 2 ? window.lastIndexOf(" ") : window.length;
    result.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
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
    let current: Unit[] = [];
    const flush = () => {
      const text = joined(current).trim();
      if (text) chunks.push({ ordinal: chunks.length, page, text });
    };
    for (const unit of units(pageText).flatMap(unit => pieces(unit.text, size).map((text, i) => ({ text, separator: i === 0 ? unit.separator : " " as const })))) {
      if (current.length && joined([...current, unit]).length > size) {
        flush();
        // Carry trailing units up to the overlap budget into the next chunk.
        const carried: Unit[] = [];
        for (const previous of [...current].reverse()) {
          if (joined([previous, ...carried]).length > overlap) break;
          carried.unshift(previous);
        }
        // Overlap never pushes a chunk past its size limit.
        current = joined([...carried, unit]).length > size ? [] : carried;
      }
      current.push(unit);
    }
    flush();
  });
  return chunks;
}
