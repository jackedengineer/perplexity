import { z } from "zod";
import type { EvidencePackage } from "@/server/contracts/pipeline";
import { questionTextSchema } from "@/server/contracts/chat";
import { validateCitations } from "./citations";

// Private generation format. IDs come from the selected server registry, never
// arbitrary model URLs or citation-shaped text. It does not approve publication.
export function citedDraftSchema(evidence: EvidencePackage) {
  const ids = evidence.sources.map(source => source.sourceId);
  if (!ids.length) throw new Error("Selected evidence required");
  return z.strictObject({ paragraphs: z.array(z.strictObject({
    text: questionTextSchema.pipe(z.string().max(1000)),
    sourceIds: z.array(z.enum(ids as [string,...string[]])).min(1).max(3),
  })).min(1).max(8) });
}
export function renderCitedDraft(value: unknown,evidence: EvidencePackage): string {
  const draft = citedDraftSchema(evidence).parse(value);
  const text = draft.paragraphs.map(paragraph => {
    // Markers are generated here; reject ambiguous model-supplied markers rather
    // than fixing them or attaching a guessed source to unsupported prose.
    if (/\[S[^\]\n]*\]/u.test(paragraph.text) || new Set(paragraph.sourceIds).size !== paragraph.sourceIds.length) throw new Error("Invalid private citation");
    return `${paragraph.text.trim()} ${paragraph.sourceIds.map(id=>`[${id}]`).join("")}`;
  }).join("\n\n");
  validateCitations(text,evidence,true);
  return text;
}
