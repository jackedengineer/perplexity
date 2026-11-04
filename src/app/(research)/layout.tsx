import { ResearchFrame } from "@/components/conversations/research-frame";
import { requireConversationIdentity } from "@/server/conversations/service";
import "./research.css";
import "./answers.css";
import "./graphite.css";

export { workspaceViewport as viewport } from '../workspace-viewport';

export const metadata = { robots: { index: false, follow: false } };
export default async function ResearchLayout({ children }: { children: React.ReactNode }) {
  return <ResearchFrame identity={await requireConversationIdentity()}>{children}</ResearchFrame>;
}
