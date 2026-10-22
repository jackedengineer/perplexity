"use client";
import { useState,type ReactNode } from "react";
import type { AnswerNode,PublicAnswer } from "@/server/answers/view";
import { Icon } from "./icons";
function Citation({ source }: { source: PublicAnswer["sources"][number] }) {
  return <a className="answer-citation" href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Source ${source.number}: ${source.title}`}>
    <Icon name="link" size={10} /><span>{source.domain.replace(/\.(gov|com|org|edu)$/u,"")}</span><span className="citation-tooltip" role="tooltip">{source.title}<small>{source.domain} · Source {source.number}</small></span>
  </a>;
}
export function ApprovedAnswer({ answer,text,onSources }: { answer: PublicAnswer;text: string;onSources: ()=>void }) {
  const [copied,setCopied] = useState(false),[copyFailed,setCopyFailed] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text);setCopied(true);setCopyFailed(false);setTimeout(()=>setCopied(false),1800); }
    catch { setCopyFailed(true); }
  }
  function render(nodes: AnswerNode[]): ReactNode { return nodes.map((node,index)=>{
    const children = node.children ? render(node.children) : null;
    switch (node.type) {
      case "text": return node.text;
      case "citation": { const source = answer.sources.find(s=>s.number === node.number);return source ? <Citation key={index} source={source} /> : null; }
      case "paragraph": return <p key={index}>{children}</p>;
      case "heading": return node.depth === 1 || node.depth === 2 ? <h2 key={index}>{children}</h2> : <h3 key={index}>{children}</h3>;
      case "strong": return <strong key={index}>{children}</strong>;
      case "emphasis": return <em key={index}>{children}</em>;
      case "blockquote": return <blockquote key={index}>{children}</blockquote>;
      case "list": return node.ordered ? <ol key={index}>{children}</ol> : <ul key={index}>{children}</ul>;
      case "listItem": return <li key={index}>{children}</li>;
      case "inlineCode": return <code key={index}>{node.text}</code>;
      case "code": return <pre key={index}><code>{node.text}</code></pre>;
      case "break": return <br key={index} />;
      case "thematicBreak": return <hr key={index} />;
    }
  }); }
  return <div className="approved-answer">
    <div className="answer-researched">{answer.kind === "ANSWER" ? "Researched" : answer.kind === "NO_EVIDENCE" ? "Search complete" : "One more detail"}</div>
    <div className="answer-prose">{render(answer.document)}</div>
    <div className="answer-actions">
      <button className="research-icon-button" onClick={()=>void copy()} aria-label={copied ? "Answer copied" : "Copy answer"}><Icon name={copied ? "check" : "copy"} size={17} /></button>
      {answer.sources.length > 0 && <button className="answer-source-count" onClick={onSources}><Icon name="link" size={15} />{answer.sources.length} {answer.sources.length === 1 ? "source" : "sources"}</button>}
      <span className="copy-feedback" role="status">{copyFailed ? "Copy is unavailable. Select the text to copy it." : copied ? "Copied" : ""}</span>
    </div>
  </div>;
}
export function SourcesPanel({ answer,open,onToggle }: { answer: PublicAnswer | null;open: boolean;onToggle: ()=>void }) {
  if (!answer?.sources.length) return null;
  return <aside className={`answer-sources ${open ? "sources-open" : ""}`} aria-label="Answer sources">
    <button className="sources-toggle" onClick={onToggle} aria-expanded={open} aria-controls="approved-source-list">Sources<span className="toolbar-spacer" /><span className="source-total">{answer.sources.length}</span><Icon name={open ? "down" : "chevron"} size={14} /></button>
    {open && <div id="approved-source-list" className="source-list">
      {answer.sources.map(source=><a key={source.sourceId} className="source-card" href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        <span className="source-monogram" aria-hidden="true">{source.domain[0].toUpperCase()}</span><div><span className="source-domain">{source.domain}<span className="source-number">{source.number}</span></span><h3>{source.title}</h3></div><Icon name="external" size={13} />
      </a>)}
      <p className="source-support-note">Citations identify the sources used. Factual support hasn’t been independently checked.</p>
    </div>}
  </aside>;
}
