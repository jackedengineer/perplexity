import { StartQuestion } from "@/components/conversations/question-composer";
import { Icon } from "@/components/conversations/icons";

export const metadata = { title: "New conversation" };
export default function Workspace() {
  return <main id="main" className="research-page">
    <div className="research-topbar home-topbar"><span className="private-pill"><Icon name="lock" size={13} />Private workspace</span></div>
    <StartQuestion />
  </main>;
}
