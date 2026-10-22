"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SessionControls } from "@/components/session-controls";
import type { Conversation } from "@/server/conversations/contracts";
import { Icon, ResearchMark, type IconName } from "./icons";

export function ResearchShell({ children, recent, name, initialCollapsed }: {
  children: React.ReactNode; recent: Conversation[]; name: string; initialCollapsed: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [recentOpen, setRecentOpen] = useState(true);
  const mobileNav = useRef<HTMLDialogElement>(null);
  const account = useRef<HTMLDialogElement>(null);
  const search = () => { mobileNav.current?.close(); router.push("/library?search=1"); };
  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); router.push("/library?search=1");
      }
    }
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [router]);
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `perplex_sidebar=${next ? "collapsed" : "expanded"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  function sidebar(isCollapsed: boolean, mobile = false) {
    const close = () => mobileNav.current?.close();
    return <>
      <div className="sidebar-top">
        <Link href="/workspace" aria-label="Perplex home" className="research-icon-button" onClick={close}><ResearchMark /></Link>
        {!isCollapsed && <div className="sidebar-top-actions">
          <button className="research-icon-button" aria-label="Search conversations" onClick={search}><Icon name="search" size={17} /></button>
          <button className="research-icon-button" aria-label={mobile ? "Close navigation" : "Collapse sidebar"} onClick={mobile ? close : toggleSidebar}><Icon name={mobile ? "close" : "panel"} size={17} /></button>
        </div>}
        {isCollapsed && <button className="expand-sidebar" aria-label="Expand sidebar" onClick={toggleSidebar}><Icon name="panel" size={17} /></button>}
      </div>
      <nav className="sidebar-navigation" aria-label={mobile ? "Mobile navigation" : "Primary navigation"}>
        <Link href="/workspace" className="sidebar-link" aria-label="New conversation" onClick={close}><Icon name="plus" /><span>New</span></Link>
        <div className="future-navigation">
          {([["computer", "Computer"], ["automation", "Automations"], ["artifact", "Artifacts"], ["settings", "Customize"]] as [IconName, string][]).map(([icon, label]) =>
            <button key={label} className="sidebar-link" disabled title={`${label} is not available yet`} aria-label={`${label} — coming later`}><Icon name={icon} /><span>{label}</span></button>)}
        </div>
        <div className="sidebar-section-label projects-label"><Icon name="folder" size={18} /><span>Projects</span><Icon name="chevron" size={14} /></div>
        <div className={`sidebar-section-label ${pathname === "/library" ? "is-selected" : ""}`}>
          <Link href="/library" aria-label="Recents" onClick={close}><Icon name="clock" size={18} /><span>Recents</span></Link>
          {!isCollapsed && <button className="research-icon-button" aria-label={recentOpen ? "Collapse recents" : "Expand recents"} aria-expanded={recentOpen} onClick={() => setRecentOpen(!recentOpen)}><Icon name={recentOpen ? "down" : "chevron"} size={14} /></button>}
        </div>
        {!isCollapsed && recentOpen && <div className="sidebar-recents">
          {recent.length === 0 ? <p>No recent conversations</p> : recent.map((conversation) =>
            <Link key={conversation.id} href={`/search/${conversation.id}`} onClick={close} title={conversation.title}
              aria-current={pathname === `/search/${conversation.id}` ? "page" : undefined}>{conversation.title}</Link>)}
          {recent.length === 20 && <Link href="/library" onClick={close}>View all</Link>}
        </div>}
      </nav>
      <div className="sidebar-footer">
        {!isCollapsed && <div className="private-workspace"><Icon name="lock" size={12} />Private workspace</div>}
        <button className="account-button" aria-label="Open account menu" onClick={() => { close(); account.current?.showModal(); }}>
          <span className="account-avatar"><Icon name="user" size={16} /></span>
          {!isCollapsed && <span className="account-name">{name}<small>Personal account</small></span>}
        </button>
      </div>
    </>;
  }
  return <div className={`research-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
    <aside className="research-sidebar">{sidebar(collapsed)}</aside>
    <div className="research-column">
      <div className="research-mobile-header">
        <button className="research-icon-button" aria-label="Open navigation" onClick={() => mobileNav.current?.showModal()}><Icon name="menu" /></button>
        <Link href="/workspace" aria-label="Perplex home"><ResearchMark /></Link>
        <Link href="/workspace" className="research-icon-button" aria-label="New conversation"><Icon name="plus" /></Link>
      </div>
      {children}
    </div>
    <dialog className="mobile-navigation" aria-label="Navigation" ref={mobileNav} onClick={(event) => { if (event.target === event.currentTarget) mobileNav.current?.close(); }}>{sidebar(false, true)}</dialog>
    <dialog className="research-dialog account-dialog" aria-labelledby="account-heading" ref={account} onClick={(event) => { if (event.target === event.currentTarget) account.current?.close(); }}>
      <div className="dialog-heading"><h2 id="account-heading">Your account</h2><button className="research-icon-button" aria-label="Close account menu" onClick={() => account.current?.close()}><Icon name="close" size={17} /></button></div>
      <p>{name}</p><p className="research-muted">Your conversations are private.</p><SessionControls />
    </dialog>
  </div>;
}
