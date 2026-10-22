import Link from "next/link";
import { Icon } from "@/components/conversations/icons";

export default function UnavailableConversation() {
  return <main id="main" className="research-state"><Icon name="lock" size={28} /><h1>This conversation is unavailable.</h1><p>It may not exist, or it may belong to another account.</p><Link className="research-button" href="/workspace">Start a new conversation</Link></main>;
}
