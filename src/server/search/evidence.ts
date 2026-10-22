import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { evidencePackageSchema, sourceUrlSchema, type EvidencePackage } from "@/server/contracts/pipeline";
import { questionTextSchema } from "@/server/contracts/chat";
import { inspectInput } from "@/server/safety/deterministic";
import type { SearchResult } from "./tavily";
import { RETRIEVAL_LIMITS } from "./limits";

export const hashPassage = (text: string) => createHash("sha256").update(text,"utf8").digest("hex");
export function safeEvidenceText(text: string) {
  if (!questionTextSchema.safeParse(text).success) return false;
  const normalized = text.normalize("NFKC").replace(/\p{Cf}/gu,"");
  if (/<!--|<\/?[a-z][^>]*>|<\|(?:im_start|start_header_id)\|>|ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/iu.test(normalized)) return false;
  return inspectInput({ text,context: [] }) === null;
}
// Display identifiers only; this never authorizes direct server fetching, including DNS redirects.
export function canonicalSourceUrl(value: string): string | null {
  if (!sourceUrlSchema.safeParse(value).success || !safeEvidenceText(value)) return null;
  const url = new URL(value), host = url.hostname.toLowerCase().replace(/\.$/u,"");
  if (isIP(host) || host.includes(":") || !host.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/u.test(host)) return null;
  url.hash = "";
  for (const name of [...url.searchParams.keys()]) {
    if (/^utm_/iu.test(name) || ["fbclid","gclid","msclkid"].includes(name.toLowerCase())) url.searchParams.delete(name);
  }
  return url.toString();
}
function excerpt(text: string) {
  // slice by UTF-16 budget without splitting a surrogate pair; retain exact source text.
  let result = "";
  for (const character of text) { if (result.length+character.length > RETRIEVAL_LIMITS.passageCharacters) break; result += character; }
  return result;
}
export function buildEvidence(runId: string, results: SearchResult[], now: Date): EvidencePackage {
  const evidence: EvidencePackage = { runId,sources: [],passages: [] }, seen = new Set<string>();
  for (const result of results.slice(0,RETRIEVAL_LIMITS.results)) {
    const url = canonicalSourceUrl(result.url);
    // Reject the entire unsafe result, not merely its truncated excerpt.
    if (!url || seen.has(url) || result.title.length > 300 || !safeEvidenceText(result.title) ||
        !safeEvidenceText(result.content)) continue;
    const sourceId = `S${evidence.sources.length+1}`;
    const published = result.published_date ? Date.parse(result.published_date) : NaN;
    const source = { sourceId,url,title: result.title,publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
      retrievedAt: now.toISOString(),sourceRank: evidence.sources.length+1 };
    const text = excerpt(result.content), passage = { passageId: randomUUID(),sourceId,text,contentKind: "SEARCH_PASSAGE" as const,contentHash: hashPassage(text) };
    const candidate = { runId,sources: [...evidence.sources,source],passages: [...evidence.passages,passage] };
    if (Buffer.byteLength(JSON.stringify(candidate),"utf8") > RETRIEVAL_LIMITS.evidenceBytes) continue;
    evidence.sources.push(source); evidence.passages.push(passage); seen.add(url);
  }
  return evidencePackageSchema.parse(evidence);
}
export function validateEvidence(value: unknown) {
  const parsed = evidencePackageSchema.safeParse(value);
  if (!parsed.success || parsed.data.sources.length > RETRIEVAL_LIMITS.results ||
    Buffer.byteLength(JSON.stringify(parsed.data),"utf8") > RETRIEVAL_LIMITS.evidenceBytes ||
    parsed.data.sources.some(s=>canonicalSourceUrl(s.url) !== s.url || !safeEvidenceText(s.title)) ||
    parsed.data.passages.some(p=>p.text.length > RETRIEVAL_LIMITS.passageCharacters || !safeEvidenceText(p.text) || hashPassage(p.text) !== p.contentHash) ||
    parsed.data.sources.some(s=>parsed.data.passages.filter(p=>p.sourceId === s.sourceId).length !== 1)) return null;
  return parsed.data;
}
