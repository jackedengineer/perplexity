"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

export function LibrarySearch({ query, focusRequested }: { query: string; focusRequested: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(Boolean(query || focusRequested));
  const [draft, setDraft] = useState(query);
  const [pending, startTransition] = useTransition();
  useEffect(() => { if (focusRequested) input.current?.focus(); }, [focusRequested]);
  function search(value: string) {
    const params = new URLSearchParams({ search: "1" });
    if (value.trim()) params.set("q", value.trim());
    startTransition(() => router.replace(`/library?${params}`));
  }
  return open ? <form className="library-search" aria-busy={pending} onSubmit={(event) => { event.preventDefault(); search(draft); }}>
    {pending ? <span className="research-spinner" /> : <Icon name="search" size={15} />}
    <input ref={input} aria-label="Search your conversations" type="search" placeholder="Search your conversations" maxLength={160} value={draft} onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); startTransition(() => router.replace("/library")); } }} />
    <button className="search-clear" type="button" aria-label="Clear search" onClick={() => { setDraft(""); search(""); input.current?.focus(); }}><Icon name="close" size={14} /></button>
    <span className="sr-only" role="status">{pending ? "Searching your conversations…" : ""}</span>
  </form> : <button className="research-icon-button" aria-label="Search conversations" onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}><Icon name="search" size={18} /></button>;
}
