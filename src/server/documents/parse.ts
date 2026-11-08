import { extractText, getDocumentProxy } from "unpdf";
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

export type ParsedPdf = { pages: string[] };

// Text-based PDFs only. Scanned, encrypted and malformed files are rejected with one
// public code; the reason is not exposed beyond that.
export async function parsePdf(bytes: Uint8Array): Promise<ParsedPdf> {
  if (!hasPdfSignature(bytes)) throw new DocumentError("DOCUMENT_UNSUPPORTED");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    // pdf.js may detach the buffer it is given, so it gets a copy.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > DOCUMENT_LIMITS.maxPages) throw new DocumentError("DOCUMENT_TOO_LARGE");
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = text.map(normalizePageText);
    const characters = pages.reduce((total, page) => total + page.length, 0);
    if (!pages.length || characters < Math.max(DOCUMENT_LIMITS.minimumCharactersPerPage * pages.length, 40)) throw new DocumentError("DOCUMENT_UNREADABLE");
    return { pages };
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    throw new DocumentError("DOCUMENT_UNREADABLE");
  } finally {
    // Destroying the loading task frees the parser's memory in long-lived Workers.
    await pdf?.loadingTask.destroy().catch(() => undefined);
  }
}
