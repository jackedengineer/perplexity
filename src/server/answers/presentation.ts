import { unified } from "unified";
import remarkParse from "remark-parse";
import { approvedPayloadSchema } from "@/server/contracts/answer";
import { canonicalSourceUrl,safeEvidenceText } from "@/server/search/evidence";
import { publicAnswerView,type AnswerNode } from "./view";
type MarkdownNode = { type: string;value?: string;depth?: number;ordered?: boolean | null;start?: number | null;children?: MarkdownNode[] };
const containers = new Set(["paragraph","heading","strong","emphasis","blockquote","list","listItem"]);
// Compile once on the server; the client needs no Markdown parser or HTML interpreter.
export function presentAnswer(value: unknown) {
  const payload = approvedPayloadSchema.parse(value);
  const sources = payload.sources.map(source=>{
    if (canonicalSourceUrl(source.url) !== source.url || !safeEvidenceText(source.title)) throw new Error("Invalid approved source");
    return { sourceId: source.sourceId,number: source.number,url: source.url,title: source.title,domain: new URL(source.url).hostname.replace(/^www\./u,""),supportStatus: source.supportStatus };
  });
  let count = 0;
  function compile(node: MarkdownNode,depth: number): AnswerNode[] {
    if (++count > 2000 || depth > 24) throw new Error("Invalid approved document");
    if (node.type === "text") {
      const fragments: AnswerNode[] = [];let start = 0;
      for (const marker of (node.value ?? "").matchAll(/\[S[^\]\n]*\]/gu)) {
        if (marker.index > start) fragments.push({ type: "text",text: node.value!.slice(start,marker.index) });
        const source = sources.find(s=>`[${s.sourceId}]` === marker[0]);
        if (!source) throw new Error("Invalid approved citation");
        fragments.push({ type: "citation",number: source.number });start = marker.index+marker[0].length;
      }
      if (start < (node.value?.length ?? 0)) fragments.push({ type: "text",text: node.value!.slice(start) });
      return fragments;
    }
    if (node.type === "code" || node.type === "inlineCode") return [{ type: node.type,text: node.value ?? "" }];
    if (node.type === "break" || node.type === "thematicBreak") return [{ type: node.type }];
    if (!containers.has(node.type)) throw new Error("Invalid approved Markdown");
    return [{ type: node.type as AnswerNode["type"],...(node.depth ? { depth: node.depth } : {}),
      ...(node.type === "list" ? { ordered: Boolean(node.ordered),...(node.ordered&&typeof node.start==="number"&&node.start!==1?{start:node.start}:{}) } : {}),children: (node.children ?? []).flatMap(child=>compile(child,depth+1)) }];
  }
  const root = unified().use(remarkParse).parse(payload.markdown);
  return publicAnswerView.parse({ kind: payload.kind,sources,document: root.children.flatMap(child=>compile(child,0)) });
}
