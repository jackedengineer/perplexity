import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/current-session";
import { SessionControls } from "@/components/session-controls";

export const metadata = { title: "Your workspace" };
export default async function Workspace() {
  const identity = await getCurrentSession();
  if (!identity) redirect("/sign-in");
  return <main id="main" className="workspace">
    <header className="app-header">
      <Link href="/" className="wordmark">perplex<span aria-hidden="true">✳</span></Link>
      <SessionControls />
    </header>
    <section className="workspace-content">
      <span className="status-pill"><span aria-hidden="true" /> You’re signed in</span>
      <p className="eyebrow">Welcome, {identity.user.name.split(" ")[0]}</p>
      <h1>A home for<br /><em>your next question.</em></h1>
      <p className="intro">Your account is ready. Web research and saved conversations are the next pieces we’re building.</p>
      <div className="next-note"><span aria-hidden="true">↗</span><div><h2>There’s more on the horizon.</h2><p>This workspace will bring your questions, sources, and discoveries together.</p></div></div>
    </section>
    <footer className="workspace-footer">Stay curious.</footer>
  </main>;
}
