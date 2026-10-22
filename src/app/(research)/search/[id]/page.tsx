import { notFound } from "next/navigation";
import { Icon } from "@/components/conversations/icons";
import { ConversationActions } from "@/components/conversations/conversation-actions";
import { ConversationHistory } from "@/components/conversations/conversation-history";
import { conversationId, historyPageView } from "@/server/conversations/contracts";
import { ConversationError } from "@/server/conversations/errors";
import { getConversationRepository, requireConversationIdentity } from "@/server/conversations/service";

export const metadata = { title: "Conversation" };
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requireConversationIdentity();
  const { id } = await params;
  if (!conversationId.safeParse(id).success) notFound();
  let result;
  try { result = await getConversationRepository().history(identity.user.id, id, { limit: 20 }); }
  catch (error) { if (error instanceof ConversationError && error.code === "NOT_FOUND") notFound(); throw error; }
  return <main id="main" className="thread-page">
    <header className="research-topbar"><span className="thread-tab"><Icon name="search" size={16} />Conversation</span><span className="toolbar-spacer" /><ConversationActions conversation={result.conversation} /><span className="private-pill"><Icon name="lock" size={13} />Private</span></header>
    <section className="thread-content" aria-label="Conversation history" tabIndex={0}><h1>{result.conversation.title}</h1>
      {result.items.length ? <ConversationHistory key={`${id}:${result.conversation.revision}`} conversationId={id} initial={historyPageView.parse(result)} /> : <div className="thread-empty"><Icon name="lock" size={24} /><h2>Your conversation is ready.</h2><p>This private space is saved. Web research and AI answers are coming next.</p></div>}
    </section>
    <div className="thread-bottom"><div className="research-composer inactive-composer"><p>Ask a follow-up…</p><div className="composer-toolbar"><Icon name="lock" size={16} /><span>AI research is not connected yet</span><span className="toolbar-spacer" /><span className="send-button" aria-hidden="true"><Icon name="arrow" size={18} /></span></div></div></div>
  </main>;
}
