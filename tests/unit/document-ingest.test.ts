import { describe, expect, it, vi } from "vitest";
import { chunkPages } from "@/server/documents/chunk";
import { createOpenRouterEmbeddings, embeddingCapMicroUsd, EMBEDDING_MODEL } from "@/server/documents/embedding";
import { DOCUMENT_LIMITS } from "@/server/documents/limits";
import { hasPdfSignature, normalizePageText, parsePdf } from "@/server/documents/parse";
import { documentTitle } from "@/server/documents/service";
import { fixturePdf } from "../helpers/documents";

describe("parsing", () => {
  it("extracts text page by page from a text PDF", async () => {
    const { pages } = await parsePdf(await fixturePdf("water-report"));
    expect(pages).toHaveLength(3);
    expect(pages[1]).toContain("0.37 NTU");
    expect(pages[2]).toContain("12 membrane modules");
  });
  it("keeps table rows and two-column reading order", async () => {
    expect((await parsePdf(await fixturePdf("budget-table"))).pages[0]).toContain("South 90 95 110 130");
    const columns = (await parsePdf(await fixturePdf("two-column"))).pages.join("\n");
    expect(columns.indexOf("Note 1:")).toBeLessThan(columns.indexOf("Note 12:"));
  });
  it("rejects scans, non-PDFs and corrupt files with one public code each", async () => {
    await expect(parsePdf(await fixturePdf("scanned"))).rejects.toMatchObject({ code: "DOCUMENT_UNREADABLE" });
    await expect(parsePdf(await fixturePdf("not-a-pdf"))).rejects.toMatchObject({ code: "DOCUMENT_UNSUPPORTED" });
    const truncated = (await fixturePdf("water-report")).subarray(0, 400);
    await expect(parsePdf(truncated)).rejects.toMatchObject({ code: "DOCUMENT_UNREADABLE" });
  });
  it("finds the PDF header even after a short preamble, and strips control characters", () => {
    expect(hasPdfSignature(new TextEncoder().encode("\n\n%PDF-1.7"))).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode("PK\u0003\u0004"))).toBe(false);
    expect(normalizePageText("a\u0000b\u200b  c\r\n\n  d ")).toBe("a b c\nd");
  });
});

describe("chunking", () => {
  it("keeps every chunk within one page and under the passage limit", () => {
    const long = Array.from({ length: 80 }, (_, i) => `Sentence ${i} about turbidity and filtration uptime in the lake.`).join(" ");
    const chunks = chunkPages([long, "Short second page.", ""]);
    expect(chunks.every(chunk => chunk.text.length <= DOCUMENT_LIMITS.chunkCharacters)).toBe(true);
    expect(chunks.map(chunk => chunk.ordinal)).toEqual(chunks.map((_, index) => index));
    expect(chunks.at(-1)).toMatchObject({ page: 2, text: "Short second page." });
    expect(new Set(chunks.filter(chunk => chunk.page === 1).map(chunk => chunk.page)).size).toBe(1);
  });
  it("overlaps neighbouring chunks so a fact at a boundary is still found", () => {
    const sentences = Array.from({ length: 40 }, (_, i) => `Fact number ${i} is recorded here.`);
    const chunks = chunkPages([sentences.join(" ")], 200, 60);
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1].text.split(/(?<=\.)\s/u).at(-1)!;
      expect(chunks[i].text.startsWith(tail)).toBe(true);
    }
  });
  it("splits a single unbroken run of text without exceeding the limit", () => {
    const chunks = chunkPages(["x".repeat(2500)], 900, 150);
    expect(chunks.map(chunk => chunk.text.length)).toEqual([900, 900, 700]);
  });
});

it("turns any filename into safe display text", () => {
  expect(documentTitle("..%2F..%2Fetc%2Fq3%20report.pdf")).toBe("q3 report.pdf");
  expect(documentTitle("C:\\Users\\me\\notes.pdf")).toBe("notes.pdf");
  expect(documentTitle("bad\u0000\u202ename.pdf")).toBe("badname.pdf");
  expect(documentTitle(null)).toBe("Document.pdf");
  expect([...documentTitle("é".repeat(500))]).toHaveLength(DOCUMENT_LIMITS.maxTitleCharacters);
});

describe("embedding client", () => {
  const vector = (seed: number) => Array.from({ length: 1536 }, (_, i) => (i === seed ? 1 : 0));
  const reply = (body: unknown, status = 200) => vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }));
  it("uses private routing and returns vectors in input order with the reported cost", async () => {
    const request = reply({ data: [{ index: 1, embedding: vector(1) }, { index: 0, embedding: vector(0) }], usage: { cost: 0.0000005 } });
    const result = await createOpenRouterEmbeddings("synthetic-key-0123456789", request).embed(["a", "b"], new AbortController().signal);
    expect(result.vectors[0][0]).toBe(1);
    expect(result.costMicroUsd).toBe(1n);
    // The live API reports sub-microdollar costs in exponent form.
    const tiny = reply({ data: [{ index: 0, embedding: vector(0) }], usage: { cost: 4.6e-7 } });
    expect((await createOpenRouterEmbeddings("synthetic-key-0123456789", tiny).embed(["a"], new AbortController().signal)).costMicroUsd).toBe(1n);
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ model: EMBEDDING_MODEL, input: ["a", "b"], provider: { zdr: true, data_collection: "deny", allow_fallbacks: false } });
  });
  it("rejects errors, wrong dimensions and mismatched counts without leaking the response", async () => {
    for (const request of [reply({ error: "PRIVATE" }, 503), reply({ data: [{ index: 0, embedding: [1, 2] }] }), reply({ data: [{ index: 0, embedding: vector(0) }] })]) {
      const error = await createOpenRouterEmbeddings("synthetic-key-0123456789", request).embed(["a", "b"], new AbortController().signal).catch(e => e);
      expect(error.message).toBe("Embedding unavailable");
    }
  });
  it("bounds the worst-case cost before the call is made", () => {
    expect(embeddingCapMicroUsd(["x".repeat(1000)])).toBe(21n);
    expect(embeddingCapMicroUsd(["é".repeat(1000)])).toBe(41n);
  });
});

describe("abuse resistance", () => {
  it("refuses a tiny PDF that expands into millions of characters, quickly", async () => {
    const { compressedTextPdf } = await import("../helpers/documents");
    const bomb = compressedTextPdf(Array.from({ length: 3 }, () => "A".repeat(1_000_000)));
    expect(bomb.length).toBeLessThan(20_000);
    const started = performance.now();
    await expect(parsePdf(bomb)).rejects.toMatchObject({ code: "DOCUMENT_TOO_LARGE" });
    expect(performance.now() - started).toBeLessThan(5_000);
  });
  it("stops at the whole-file character budget across many modest pages", async () => {
    const { compressedTextPdf } = await import("../helpers/documents");
    const pages = compressedTextPdf(Array.from({ length: 4 }, () => "Word ".repeat(1_000)), 100);
    await expect(parsePdf(pages)).rejects.toMatchObject({ code: "DOCUMENT_TOO_LARGE" });
    const fine = compressedTextPdf(["Turbidity was 0.37 NTU in the third quarter."], 2);
    expect((await parsePdf(fine)).pages).toHaveLength(2);
  });
  it("chunks a very long unbroken run in linear time", () => {
    const started = performance.now();
    const chunks = chunkPages(["x".repeat(2_000_000)]);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(chunks.every(chunk => chunk.text.length <= DOCUMENT_LIMITS.chunkCharacters)).toBe(true);
    expect(chunks.reduce((total, chunk) => total + chunk.text.length, 0)).toBe(2_000_000);
  });
});

it("bounds the embedded question to 4,000 UTF-8 bytes on a character boundary", async () => {
  const { boundedQuestion } = await import("@/server/documents/retrieve");
  expect(boundedQuestion("short")).toBe("short");
  const tamil = "தமிழ்".repeat(1000);
  const bounded = boundedQuestion(tamil);
  expect(new TextEncoder().encode(bounded).length).toBeLessThanOrEqual(4000);
  expect(tamil.startsWith(bounded)).toBe(true);
  expect(embeddingCapMicroUsd([bounded])).toBeLessThanOrEqual(100n);
});
