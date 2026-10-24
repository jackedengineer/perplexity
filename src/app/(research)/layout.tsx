import {ModelAccessProvider} from "@/components/conversations/model-access";
import { QuestionIntentProvider } from "@/components/conversations/question-intent";
import { cookies } from "next/headers";
import { ResearchShell } from "@/components/conversations/research-shell";
import { getConversationRepository, requireConversationIdentity } from "@/server/conversations/service";
import "./research.css";
import "./answers.css";

export const metadata = { robots: { index: false, follow: false } };
export default async function ResearchLayout({ children }: { children: React.ReactNode }) {
  const identity = await requireConversationIdentity();
  const [recent, preferences] = await Promise.all([
    getConversationRepository().list(identity.user.id, { limit: 20, q: "" }), cookies(),
  ]);
  return <ModelAccessProvider><QuestionIntentProvider><ResearchShell name={identity.user.name} recent={recent.items} initialCollapsed={preferences.get("perplex_sidebar")?.value !== "expanded"}>{children}</ResearchShell></QuestionIntentProvider></ModelAccessProvider>;
}
