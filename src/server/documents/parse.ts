import { getDocumentProxy } from "unpdf";
import { DOCUMENT_LIMITS, DocumentError } from "./limits";

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function hasPdfSignature(bytes: Uint8Array) {
  // Some generators write a short preamble before the header, which the PDF spec tolerates.
  const window = bytes.subarray(0, 1024);
  for (let start = 0; start + PDF_SIGNATURE.length <= window.length; start++) {
    if (PDF_SIGNATURE.every((byte, offset) => window[start + offset] === byte)) return true;
  }
  return false;
}

// Keeps line breaks (tables and lists read better) but removes the control characters
// that evidence validation rejects, and collapses layout whitespace.
export function normalizePageText(text: string) {
  return text.normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .split("\n").map(line => line.replace(/[^\S\n]+/gu, " ").trim()).filter(Boolean).join("\n");
}

type TextItem = { str?: string; hasEOL?: boolean };
export type ParsedPdf = { pages: string[]; characters: number };

// Text-based PDFs only. Pages are read one at a time against a running budget, so a tiny
// file that expands into millions of characters is refused after the first oversized page
// instead of exhausting the Worker. Scanned, encrypted and malformed files are rejected.
export async function parsePdf(bytes: Uint8Array): Promise<ParsedPdf> {
  if (!hasPdfSignature(bytes)) throw new DocumentError("DOCUMENT_UNSUPPORTED");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    // pdf.js may detach the buffer it is given, so it gets a copy.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > DOCUMENT_LIMITS.maxPages) throw new DocumentError("DOCUMENT_TOO_LARGE");
    const pages: string[] = [];
    let characters = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      // Streamed, so reading stops as soon as one page passes its budget.
      const reader = page.streamTextContent().getReader() as ReadableStreamDefaultReader<{ items: TextItem[] }>;
      let raw = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const item of value.items) raw += (item.str ?? "") + (item.hasEOL ? "\n" : "");
          if (raw.length > DOCUMENT_LIMITS.maxPageCharacters * 2) throw new DocumentError("DOCUMENT_TOO_LARGE");
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        page.cleanup();
      }
      const text = normalizePageText(raw);
      characters += text.length;
      if (text.length > DOCUMENT_LIMITS.maxPageCharacters || characters > DOCUMENT_LIMITS.maxCharacters) throw new DocumentError("DOCUMENT_TOO_LARGE");
      pages.push(text);
    }
    if (!pages.length || characters < Math.max(DOCUMENT_LIMITS.minimumCharactersPerPage * pages.length, 40)) throw new DocumentError("DOCUMENT_UNREADABLE");
    return { pages, characters };
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    throw new DocumentError("DOCUMENT_UNREADABLE");
  } finally {
    // Destroying the loading task frees the parser's memory in long-lived Workers.
    await pdf?.loadingTask.destroy().catch(() => undefined);
  }
}
