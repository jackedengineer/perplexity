import {configuredResearchModels} from '@/server/deep-research/configuration';
import {jobsEnabled} from '@/server/jobs/service';
import {ModelAccessProvider} from "@/components/conversations/model-access";
import { QuestionIntentProvider } from "@/components/conversations/question-intent";
import { cookies } from "next/headers";
import { ResearchShell } from "@/components/conversations/research-shell";
import { getConversationRepository, requireConversationIdentity } from "@/server/conversations/service";
import "./research.css";
import "./answers.css";
import "./graphite.css";

export const metadata = { robots: { index: false, follow: false } };
export default async function ResearchLayout({ children }: { children: React.ReactNode }) {
  const identity = await requireConversationIdentity();
  const [recent, pinned, preferences] = await Promise.all([
    getConversationRepository().list(identity.user.id, { limit: 20, q: "" }), getConversationRepository().list(identity.user.id, {limit:20,q:"",pinned:"true"}), cookies(),
  ]);
  let deepResearchEnabled=false;try{configuredResearchModels();deepResearchEnabled=true;}catch{/* Default off. */}
  return <ModelAccessProvider preferenceKey={identity.user.id}><QuestionIntentProvider><ResearchShell deepResearchEnabled={deepResearchEnabled} jobsEnabled={jobsEnabled()} name={identity.user.name} recent={recent.items} pinned={pinned.items} initialCollapsed={preferences.get("perplex_sidebar")?.value === "collapsed"}>{children}</ResearchShell></QuestionIntentProvider></ModelAccessProvider>;
}
