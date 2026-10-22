"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Conversation } from "@/server/conversations/contracts";
import { ConversationRequestError, mutateConversation } from "./client-api";
import { Icon } from "./icons";

export function ConversationActions({ conversation,renameUnavailable=false }: { conversation: Conversation;renameUnavailable?:boolean }) {
  const router = useRouter();
  const menuId = useId();
  const headingId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  function rename() {
    menu.current?.hidePopover();
    setError(""); setTitle(conversation.title);
    dialog.current?.showModal(); input.current?.focus(); input.current?.select();
  }
  async function save() {
    if (pending || !title.trim()) return;
    setPending(true); setError("");
    try {
      await mutateConversation(`/api/conversations/${conversation.id}`, "PATCH", { title, expectedRevision: conversation.revision });
      dialog.current?.close(); router.refresh();
    } catch (failure) {
      if (failure instanceof ConversationRequestError && failure.status === 401) router.replace("/sign-in");
      setError(failure instanceof ConversationRequestError ? failure.message : "We couldn’t save that change. Please try again.");
    } finally { setPending(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`${location.origin}/search/${conversation.id}`); setCopyStatus("Private link copied"); }
    catch { setCopyStatus("Couldn’t copy the link"); }
  }
  return <>
    <button ref={trigger} className="research-icon-button" aria-label="Conversation actions" aria-haspopup="menu" aria-expanded={menuOpen} popoverTarget={menuId}><Icon name="more" size={20} /></button>
    <div id={menuId} ref={menu} popover="auto" className="conversation-menu" role="menu" aria-label="Conversation actions"
      onToggle={(event) => { const open = event.currentTarget.matches(":popover-open"); setMenuOpen(open); if (open) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); }}
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      <p className="conversation-menu-title">{conversation.title}</p>
      <button role="menuitem" onClick={rename} disabled={renameUnavailable} title={renameUnavailable?"Finish the active research request before renaming.":undefined}>Rename</button>
      <button role="menuitem" onClick={() => void copy()}><Icon name="link" size={16} />Copy private link</button>
      <p className="menu-hint" role="status">{copyStatus || "Only your account can open this conversation."}</p>
    </div>
    <dialog ref={dialog} onClose={() => trigger.current?.focus()} className="research-dialog rename-dialog" aria-labelledby={headingId} onCancel={(event) => { if (pending) event.preventDefault(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !pending) dialog.current?.close(); }}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} aria-busy={pending}>
        <div className="dialog-heading"><h2 id={headingId}>Edit conversation title</h2><button className="research-icon-button" type="button" disabled={pending} aria-label="Close rename dialog" onClick={() => dialog.current?.close()}><Icon name="close" size={17} /></button></div>
        <textarea ref={input} aria-label="Title" rows={2} maxLength={160} value={title} disabled={pending} onChange={(event) => setTitle(event.target.value)} />
        <div className="rename-feedback" aria-live="polite">{error && <p role="alert">{error}</p>}</div>
        <div className="dialog-footer">{error.includes("Reload") && <button className="research-button" type="button" onClick={() => { dialog.current?.close(); router.refresh(); }}>Reload conversation</button>}<button className="research-button primary" disabled={pending || !title.trim()}>{pending ? "Saving…" : "Save"}</button></div>
      </form>
    </dialog>
  </>;
}
