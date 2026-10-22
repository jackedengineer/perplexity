import Link from "next/link";
import { listInput } from "@/server/conversations/contracts";
import { getConversationRepository, requireConversationIdentity } from "@/server/conversations/service";
import { Icon } from "@/components/conversations/icons";
import { LibrarySearch } from "@/components/conversations/library-search";

export const metadata = { title: "Sessions" };
export default async function Library({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await requireConversationIdentity();
  const parameters = await searchParams;
  const input = listInput.safeParse({ q: parameters.q, cursor: parameters.cursor, limit: parameters.limit });
  if (!input.success) return <main id="main" className="research-state"><h1>Check your search.</h1><p>The search or page address is invalid.</p><Link href="/library" className="research-button">Clear search</Link></main>;
  const result = await getConversationRepository().list(identity.user.id, input.data);
  return <main id="main" className="library-page">
    <header className="research-topbar"><h1>Sessions</h1><span className="toolbar-spacer" /><LibrarySearch key={`${input.data.q}:${parameters.search}`} query={input.data.q} focusRequested={parameters.search === "1"} /><Link href="/workspace" className="research-button"><Icon name="plus" size={16} />New</Link></header>
    <div className="library-toolbar"><span className="sort-label">Newest first<Icon name="down" size={12} /></span></div>
    <div className="library-list">
      {result.items.length ? result.items.map((conversation) => <Link className="library-row" key={conversation.id} href={`/search/${conversation.id}`} prefetch={false}>
        <Icon name="search" size={18} /><span className="row-kind">Search</span><span className="row-title">{conversation.title}</span><span className="row-description">Private conversation</span><time dateTime={conversation.updatedAt}>{new Date(conversation.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</time>
      </Link>) : <div className="library-empty">{input.data.q ? <>No sessions found for “{input.data.q}”</> : <><h2>No conversations yet</h2><p>Your private conversations will appear here.</p><Link className="research-button" href="/workspace">Start a conversation</Link></>}</div>}
      {result.nextCursor && <Link className="research-button load-more" href={`/library?cursor=${result.nextCursor}&q=${encodeURIComponent(input.data.q)}`}>Next page</Link>}
    </div>
  </main>;
}
