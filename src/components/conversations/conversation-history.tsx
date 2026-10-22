"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { historyPageView, type HistoryPage } from "@/server/conversations/contracts";

export function ConversationHistory({ conversationId, initial }: { conversationId: string; initial: HistoryPage }) {
  const router = useRouter();
  const [history, setHistory] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const restore = useRef<{ viewport: HTMLElement; height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const previous = restore.current;
    if (previous) previous.viewport.scrollTop = previous.top + previous.viewport.scrollHeight - previous.height;
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
      if (viewport) restore.current = { viewport, height: viewport.scrollHeight, top: viewport.scrollTop };
      setHistory((current) => {
        const known = new Set(current.items.map((item) => item.id));
        return { items: [...page.items.filter((item) => !known.has(item.id)), ...current.items], nextBefore: page.nextBefore };
      });
    } catch { setFailed(true); }
    finally { setPending(false); }
  }
  return <div ref={root} className="history-stack">
    {history.nextBefore && <button className="research-button load-older" disabled={pending} onClick={() => void older()}>{pending ? "Loading earlier messages…" : "Load earlier messages"}</button>}
    <div className="history-feedback" aria-live="polite">{failed && <p role="alert">Earlier messages couldn’t load. Please try again.</p>}</div>
    {history.items.map((message) => <article className="history-message" key={message.id}>
      <h2>{message.role === "USER" ? "You" : "Answer"}</h2>{message.parts.map((part, index) => <p key={index}>{part.text}</p>)}
    </article>)}
  </div>;
}
