import { unified } from "unified";
import remarkParse from "remark-parse";
import type { EvidencePackage } from "@/server/contracts/pipeline";
import { canonicalSourceUrl,validateEvidence } from "@/server/search/evidence";
import { inspectInput } from "@/server/safety/deterministic";
import { questionTextSchema } from "@/server/contracts/chat";
export type VisibleSource = { sourceId: string;number: number;url: string;title: string;publishedAt: string | null;
  passageIds: string[];contentHashes: string[];supportStatus: "NOT_CHECKED";retrievedAt?:string;contentKind?:"SEARCH_PASSAGE"|"EXTRACTED_PAGE" };
type Node = { type: string;value?: string;children?: Node[] };
const allowedNodes = new Set(["root","paragraph","text","heading","emphasis","strong","delete","blockquote","list","listItem","code","inlineCode","break","thematicBreak"]);
export function validateCitations(markdown: string,evidence: EvidencePackage,required: boolean): VisibleSource[] {
  if (!questionTextSchema.safeParse(markdown).success || !validateEvidence(evidence) || /\\\[/u.test(markdown)) throw new Error("Invalid visible response");
  const normalized = markdown.normalize("NFKC").replace(/\p{Cf}/gu,"");
  if (inspectInput({ text: markdown,context: [] }) || /<\/?[A-Za-z]|<!--|(?:https?:\/\/|www\.|javascript:|data:|file:)/iu.test(normalized)) throw new Error("Invalid visible response");
  for (const marker of markdown.match(/\[S[^\]\n]*\]/gu) ?? []) {
    if (!/^\[S[1-5]\]$/u.test(marker) || !evidence.sources.some(s=>`[${s.sourceId}]` === marker)) throw new Error("Invalid citation");
  }
  const ids: string[] = [];let nodes = 0,occurrences = 0;
  function visit(node: Node,depth: number) {
    if (++nodes > 2000 || depth > 24 || !allowedNodes.has(node.type)) throw new Error("Unsafe Markdown");
    if (node.type === "text") {
      const text = node.value ?? "";
      if (/(?:https?:\/\/|www\.|javascript:|data:|file:)/iu.test(text)) throw new Error("Unsafe link");
      for (const marker of text.normalize("NFKC").replace(/\p{Cf}/gu,"").match(/\[S[^\]\n]*\]/gu) ?? []) {
        if (!evidence.sources.some(s=>`[${s.sourceId}]` === marker)) throw new Error("Unknown citation");
      }
      for (const match of text.matchAll(/\[(S[1-5])\]/gu)) { if (++occurrences > 20) throw new Error("Too many citations"); if (!ids.includes(match[1])) ids.push(match[1]); }
    }
    for (const child of node.children ?? []) visit(child,depth+1);
  }
  visit(unified().use(remarkParse).parse(markdown),0);
  if ((required && ids.length === 0) || (!required && ids.length !== 0)) throw new Error("Invalid citation count");
  return ids.map((id,index)=>visibleSourceFor(evidence,id,index+1));
}
export function visibleSourceFor(evidence:EvidencePackage,id:string,number:number):VisibleSource{
 const source=evidence.sources.find(s=>s.sourceId===id),passages=evidence.passages.filter(p=>p.sourceId===id);
 if(!source||canonicalSourceUrl(source.url)!==source.url||passages.length!==1)throw new Error('Unsafe source');
 return {sourceId:id,number,url:source.url,title:source.title,publishedAt:source.publishedAt,passageIds:passages.map(p=>p.passageId),contentHashes:passages.map(p=>p.contentHash),supportStatus:'NOT_CHECKED',retrievedAt:source.retrievedAt,contentKind:passages[0].contentKind};
}
