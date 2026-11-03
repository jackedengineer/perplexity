"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApprovedAnswer,SourcesPanel } from "./approved-answer";
import type { PublicAnswer } from "@/server/answers/view";
import { historyPageView, type HistoryPage } from "@/server/conversations/views";
import type {AnswerReveal} from './use-answer-reveal';

export function ConversationHistory({ conversationId, initial,reveal,sourcesOpen: controlledOpen,onSourcesOpenChange,onRevise }: { conversationId: string; initial: HistoryPage;reveal?:AnswerReveal;sourcesOpen?: boolean;onSourcesOpenChange?: (value:boolean)=>void;onRevise?:(text:string,action:"edit"|"retry")=>void }) {
  const router = useRouter();
  const [history, setHistory] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [localOpen,setLocalOpen] = useState(false);
  const sourcesOpen=controlledOpen??localOpen;
  const setSourcesOpen=onSourcesOpenChange??setLocalOpen;
  const [selected,setSelected] = useState<PublicAnswer | null>(null);
  const currentAnswer = selected ?? history.items.findLast(message=>message.answer)?.answer ?? null;
  const root = useRef<HTMLDivElement>(null);
  const restore = useRef<{ viewport: HTMLElement; height: number; top: number; focus: boolean } | null>(null);
  useLayoutEffect(() => {
    const previous = restore.current;
    if (previous) {
      previous.viewport.scrollTop = previous.top + previous.viewport.scrollHeight - previous.height;
      if (previous.focus && !history.nextBefore) root.current?.querySelector<HTMLElement>("article")?.focus({ preventScroll: true });
    }
    restore.current = null;
  }, [history]);
  async function older() {
    if (!history.nextBefore || pending) return;
    setPending(true); setFailed(false);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages?before=${history.nextBefore}&limit=20`, {
        credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 401) { router.replace("/sign-in"); return; }
      if (!response.ok) throw new Error("History unavailable");
      const page = historyPageView.parse(await response.json());
      const viewport = root.current?.closest<HTMLElement>(".thread-content");
      if (viewport) restore.current = { viewport, height: viewport.scrollHeight, top: viewport.scrollTop, focus: document.activeElement === root.current?.querySelector("button") };
      setLoaded(page.items.length);
      setHistory((current) => {
        const known = new Set(current.items.map((item) => item.id));
        return { items: [...page.items.filter((item) => !known.has(item.id)), ...current.items], nextBefore: page.nextBefore };
      });
    } catch { setFailed(true); }
    finally { setPending(false); }
  }
  return <div ref={root} className="history-stack">
    {history.nextBefore && <button className="research-button load-older" disabled={pending} onClick={() => void older()}>{pending ? "Loading earlier messages…" : "Load earlier messages"}</button>}
    <div className="history-feedback" aria-live="polite">{failed ? <p role="alert">Earlier messages couldn’t load. Please try again.</p> : <span className="sr-only">{loaded ? `${loaded} earlier messages loaded.` : ""}</span>}</div>
    {history.items.map((message,index) => <article className={`history-message ${message.role === "USER" ? "question-message" : "answer-message"}`} tabIndex={-1} key={message.id} aria-label={message.role === "USER" ? "Your question" : "Approved answer"}>
      {message.answer ? <ApprovedAnswer messageId={message.id} answer={message.answer} text={message.parts.map(part=>part.text).join("\n")} reveal={reveal?.messageId===message.id?reveal:undefined} onSources={()=>{setSelected(message.answer!);setSourcesOpen(true);}} /> : <>{message.role === "ASSISTANT" && <h2>Answer</h2>}{message.parts.map((part,index)=><p key={index}>{part.text}</p>)}</>}
      {onRevise&&message.role==='USER'&&<button className="message-revise" onClick={()=>onRevise(message.parts.map(p=>p.text).join('\n'),'edit')}>Edit & resend</button>}
      {onRevise&&message.answer&&history.items.slice(0,index).findLast(m=>m.role==='USER')&&<button className="message-revise" onClick={()=>onRevise(history.items.slice(0,index).findLast(m=>m.role==='USER')!.parts.map(p=>p.text).join('\n'),'retry')}>Try another model</button>}
    </article>)}
    <SourcesPanel answer={currentAnswer} open={sourcesOpen} onToggle={()=>setSourcesOpen(!sourcesOpen)} />
  </div>;
}
