"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { ConversationRequestError, mutateConversation } from "./client-api";

export function CreateConversation() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const intent = useRef<{ title: string; clientRequestId: string } | null>(null);
  async function create() {
    const normalized = title.trim().replace(/\s+/gu, " ");
    if (!normalized || pending) return;
    if (intent.current?.title !== normalized) intent.current = { title: normalized, clientRequestId: crypto.randomUUID() };
    setPending(true); setError("");
    try {
      const conversation = await mutateConversation("/api/conversations", "POST", intent.current);
      router.push(`/search/${conversation.id}`);
      router.refresh();
    } catch (failure) {
      if (failure instanceof ConversationRequestError && failure.status === 401) router.replace("/sign-in");
      setError("We couldn’t confirm that it was saved. Retry to safely check the same creation request.");
      setPending(false);
    }
  }
  return <section className="new-thread">
    <div className="new-thread-heading"><span>Search</span><h1>What do you want to know?</h1></div>
    <form className="research-composer" onSubmit={(event) => { event.preventDefault(); void create(); }} aria-busy={pending}>
      <textarea aria-label="Conversation title" placeholder="Name a private conversation…" rows={2} maxLength={160}
        value={title} disabled={pending} onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void create(); } }} />
      <div className="composer-toolbar">
        <button className="research-icon-button" type="button" disabled aria-label="Attachments are not available yet"><Icon name="plus" /></button>
        <span className="composer-mode"><Icon name="lock" size={15} />Private<Icon name="down" size={13} /></span>
        <span className="toolbar-spacer" />
        <span className="toolbar-unavailable" title="Model selection arrives with guarded AI search">Model<Icon name="down" size={13} /></span>
        <button className="research-icon-button voice-control" type="button" disabled aria-label="Voice input is not available yet"><Icon name="microphone" size={17} /></button>
        <button className="send-button" type="submit" disabled={pending || !title.trim()} aria-label="Create conversation">
          {pending ? <span className="research-spinner" /> : <Icon name="arrow" size={18} />}
        </button>
      </div>
    </form>
    <div className="composer-feedback" aria-live="polite">{error ? <p role="alert">{error}</p> : <p>Start with a title. Web research and AI answers are coming next.</p>}</div>
  </section>;
}
