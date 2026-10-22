import { notFound } from "next/navigation";
import { ResearchThread } from "@/components/conversations/research-thread";
import { conversationId, historyPageView } from "@/server/conversations/contracts";
import { ConversationError } from "@/server/conversations/errors";
import { getConversationRepository, requireConversationIdentity } from "@/server/conversations/service";

import { getDb } from "@/db";
import { createRunRecovery } from "@/server/runs/recover";

export const metadata = { title: "Conversation" };
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requireConversationIdentity();
  const { id } = await params;
  if (!conversationId.safeParse(id).success) notFound();
  let result,activeRunId:string|undefined;
  try { [result,activeRunId] = await Promise.all([getConversationRepository().history(identity.user.id,id,{limit:20}),createRunRecovery(getDb()).activeForConversation(identity,id)]); }
  catch (error) { if (error instanceof ConversationError && error.code === "NOT_FOUND") notFound(); throw error; }
  return <ResearchThread key={id} conversation={result.conversation} initial={historyPageView.parse(result)} activeRunId={activeRunId} />;
}
