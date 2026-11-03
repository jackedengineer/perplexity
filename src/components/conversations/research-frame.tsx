import {configuredJobResearchModels} from '@/server/jobs/cloudflare-configuration';
import {jobsEnabled} from '@/server/jobs/service';
import {ModelAccessProvider} from "@/components/conversations/model-access";
import { cookies } from "next/headers";
import { ResearchShell } from "@/components/conversations/research-shell";
import { getConversationRepository, requireConversationIdentity } from "@/server/conversations/service";

export async function ResearchFrame({ children, identity }: { children: React.ReactNode; identity: NonNullable<Awaited<ReturnType<typeof requireConversationIdentity>>> }) {
  const [recent, pinned, preferences] = await Promise.all([
    getConversationRepository().list(identity.user.id, { limit: 20, q: "" }), getConversationRepository().list(identity.user.id, {limit:20,q:"",pinned:"true"}), cookies(),
  ]);
  let deepResearchEnabled=false;try{configuredJobResearchModels();deepResearchEnabled=jobsEnabled();}catch{/* Default off. */}
  return <ModelAccessProvider preferenceKey={identity.user.id} deepAvailable={deepResearchEnabled}><ResearchShell deepResearchEnabled={deepResearchEnabled} jobsEnabled={jobsEnabled()} guest={identity.user.isAnonymous} name={identity.user.name} recent={recent.items} pinned={pinned.items} initialCollapsed={preferences.get("perplex_sidebar")?.value === "collapsed"}>{children}</ResearchShell></ModelAccessProvider>;
}
