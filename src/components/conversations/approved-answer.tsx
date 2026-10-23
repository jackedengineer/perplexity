"use client";
import { lazy,Suspense,useEffect,useId,useRef,useState,type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AnswerNode,PublicAnswer } from "@/server/answers/view";
import { Icon } from "./icons";
const AnswerFeedback=lazy(()=>import("./answer-feedback"));
function Citation({ source }: { source: PublicAnswer["sources"][number] }) {
  const id=useId(),[tip,setTip]=useState<{left:number;top:number;width:number;maxHeight:number;above:boolean}|null>(null);
  function open(element: HTMLAnchorElement) {
    const box=element.getBoundingClientRect(),width=Math.min(280,window.innerWidth-32);
    const below=window.innerHeight-box.bottom-16,above=box.top-16,useAbove=below<240&&above>below;
    setTip({left:Math.max(16,Math.min(box.left,window.innerWidth-width-16)),top:useAbove?box.top-8:box.bottom+8,width,maxHeight:Math.min(240,Math.max(80,(useAbove?above:below)-8)),above:useAbove});
  }
  useEffect(()=>{
    if(!tip)return;
    const dismiss=()=>setTip(null);window.addEventListener("scroll",dismiss,true);window.addEventListener("resize",dismiss);
    return()=>{window.removeEventListener("scroll",dismiss,true);window.removeEventListener("resize",dismiss);};
  },[tip]);
  return <><a className="answer-citation" href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Source ${source.number}: ${source.title}`} aria-describedby={tip?id:undefined}
    onFocus={event=>{const element=event.currentTarget;requestAnimationFrame(()=>{if(document.activeElement===element)open(element);});}} onBlur={()=>setTip(null)} onKeyDown={event=>{if(event.key==="Escape")setTip(null);}}
    onPointerEnter={event=>{if(event.pointerType!=="touch")open(event.currentTarget);}} onPointerLeave={event=>{if(document.activeElement!==event.currentTarget)setTip(null);}}>
    <Icon name="link" size={10}/><span>{source.domain.replace(/\.(gov|com|org|edu)$/u,"")}</span>
  </a>{tip&&createPortal(<span className="citation-tooltip" role="tooltip" id={id} style={{left:tip.left,top:tip.top,width:tip.width,maxHeight:tip.maxHeight,transform:tip.above?"translateY(-100%)":undefined}}>{source.title}<small>{source.domain} · Source {source.number}</small></span>,document.body)}</>;
}
export function ApprovedAnswer({ messageId,answer,text,onSources }: {messageId:string; answer: PublicAnswer;text: string;onSources: ()=>void }) {
  const [copied,setCopied] = useState(false),[copyFailed,setCopyFailed] = useState(false);
  const copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(copyTimer.current)clearTimeout(copyTimer.current);},[]);
  async function copy() {
    try { await navigator.clipboard.writeText(text);setCopied(true);setCopyFailed(false);
      if(copyTimer.current)clearTimeout(copyTimer.current);
      copyTimer.current=setTimeout(()=>setCopied(false),1800);
    }
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
      case "list": return node.ordered ? <ol key={index} start={node.start}>{children}</ol> : <ul key={index}>{children}</ul>;
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
      <button className="research-icon-button answer-copy" onClick={()=>void copy()} aria-label={copied ? "Answer copied" : "Copy answer"}>
        <span className="copy-symbol" data-active={!copied} aria-hidden="true"><Icon name="copy" size={17}/></span>
        <span className="copy-symbol" data-active={copied} aria-hidden="true"><Icon name="check" size={17}/></span>
      </button>
      {answer.sources.length > 0 && <button className="answer-source-count" onClick={onSources}><Icon name="link" size={15} />{answer.sources.length} {answer.sources.length === 1 ? "source" : "sources"}</button>}
      <Suspense fallback={<div className="feedback-placeholder" aria-hidden="true"/>}><AnswerFeedback messageId={messageId}/></Suspense>
      <span className="copy-feedback" role="status">{copyFailed ? "Copy is unavailable. Select the text to copy it." : copied ? "Copied" : ""}</span>
    </div>
  </div>;
}
export function SourcesPanel({ answer,open,onToggle }: { answer: PublicAnswer | null;open: boolean;onToggle: ()=>void }) {
  const mobile=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const query=window.matchMedia("(max-width: 1199px)"),dialog=mobile.current;
    const sync=()=>{if(open&&query.matches){if(!dialog?.open)dialog?.showModal();}else dialog?.close();};
    const escape=(event:KeyboardEvent)=>{if(open&&!query.matches&&event.key==="Escape")onToggle();};
    sync();query.addEventListener("change",sync);window.addEventListener("keydown",escape);
    return()=>{query.removeEventListener("change",sync);window.removeEventListener("keydown",escape);dialog?.close();};
  },[open,onToggle]);
  if (!answer?.sources.length) return null;
  const total=answer.sources.length+(answer.additionalSources?.length??0);
  function cards(sources:PublicAnswer['sources'],cited:boolean){return sources.map(source=><a key={source.sourceId} className="source-card" href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
    <span className="source-monogram" aria-hidden="true">{source.domain[0].toUpperCase()}</span><div><span className="source-domain">{source.domain}<span className="source-number">{cited?source.number:'Retrieved'}</span></span><h3>{source.title}</h3>
    {source.retrievedAt&&<small className="source-evidence-meta">{source.contentKind==='EXTRACTED_PAGE'?'Page excerpt':'Search snippet'} · {source.publishedAt?`Published ${source.publishedAt.slice(0,10)}`:'Publication date unavailable'}<br/>Retrieved {source.retrievedAt.slice(0,10)}</small>}
    </div><Icon name="external" size={13}/>
  </a>);}
  const list=<div className="source-list">
    {Boolean(answer.additionalSources?.length)&&<h3 className="source-group-title">Cited in the answer</h3>}
    {cards(answer.sources,true)}
    {Boolean(answer.additionalSources?.length)&&<><h3 className="source-group-title">Additional retrieved sources</h3><p className="source-support-note">Reviewed for display; these sources were not cited in the answer.</p>{cards(answer.additionalSources!,false)}</>}
    <p className="source-support-note">Citations identify the sources used. Factual support hasn’t been independently checked.</p>
  </div>;
  return <aside className={`answer-sources ${open ? "sources-open" : ""}`} aria-label="Answer sources">
    <button className="sources-toggle" onClick={onToggle} aria-expanded={open} aria-controls="approved-source-list">Sources<span className="toolbar-spacer" /><span className="source-total">{total}</span><Icon name={open ? "down" : "chevron"} size={14} /></button>
    <div id="approved-source-list" className="desktop-source-list" hidden={!open}>{list}</div>
    <dialog ref={mobile} className="mobile-sources-dialog" aria-label="Answer sources" onCancel={event=>{event.preventDefault();onToggle();}} onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientY<box.top||event.clientY>box.bottom||event.clientX<box.left||event.clientX>box.right)onToggle();}}}>
      <div className="mobile-sources-heading"><h2>Sources <span>{total}</span></h2><button className="research-icon-button" aria-label="Close sources" onClick={onToggle}><Icon name="close"/></button></div>
      {list}
    </dialog>
  </aside>;
}
