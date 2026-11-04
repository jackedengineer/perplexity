"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {useModelAccess} from "./model-access";
import {PlanIndicator} from "./plan-indicator";
import { QuickSearch } from "./quick-search";
import {GoogleSignIn} from "@/components/google-sign-in";
import { SessionControls } from "@/components/session-controls";
import type { Conversation } from "@/server/conversations/contracts";
import { Icon, ResearchMark } from "./icons";

export function ResearchShell({ children, recent, pinned = [], name, initialCollapsed, jobsEnabled = false, deepResearchEnabled = false, visitor = false, guest = false }: {
  children: React.ReactNode; recent: Conversation[]; pinned?: Conversation[]; name: string; initialCollapsed: boolean; jobsEnabled?: boolean; deepResearchEnabled?: boolean; visitor?: boolean; guest?: boolean;
}) {
  const {data}=useModelAccess();
  const pathname = usePathname();
  const [searchOpen,setSearchOpen]=useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [recentOpen, setRecentOpen] = useState(true);
  const mobileNav = useRef<HTMLDialogElement>(null);
  const account = useRef<HTMLDialogElement>(null);
  const search = () => { mobileNav.current?.close(); if(!visitor)setSearchOpen(true); };
  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); mobileNav.current?.close(); if(!visitor)setSearchOpen(true);
      }
    }
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) mobileNav.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    window.addEventListener("keydown", shortcuts);
    return () => { window.removeEventListener("keydown", shortcuts); desktop.removeEventListener("change", closeOnDesktop); };
  }, [visitor]);
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `perplex_sidebar=${next ? "collapsed" : "expanded"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  function sidebar(isCollapsed: boolean, mobile = false) {
    const close = () => mobileNav.current?.close();
    return <>
      <div className="sidebar-top">
        <Link href="/workspace" aria-label="Perplex home" className="workspace-brand" onClick={close} inert={isCollapsed} aria-hidden={isCollapsed}><ResearchMark /><span>perplexity</span></Link>
        <button className="research-icon-button sidebar-toggle" aria-label={mobile ? "Close navigation" : isCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={mobile||!isCollapsed} onClick={mobile ? close : toggleSidebar}><Icon name={mobile ? "close" : "panel"} size={17} /></button>
      </div>
      <nav className="sidebar-navigation" aria-label={mobile ? "Mobile navigation" : "Primary navigation"}>
        <Link href="/workspace" className="sidebar-link" aria-label="New conversation" onClick={close}><Icon name="plus" /><span>New chat</span></Link>
        {jobsEnabled && <Link href="/jobs" aria-label={deepResearchEnabled?'Deep Research':'Execution checks'} className="sidebar-link" onClick={close}><Icon name="automation" /><span>{deepResearchEnabled?'Deep Research':'Execution checks'}</span></Link>}
        {!visitor&&<button className="sidebar-link" onClick={search} aria-label="Search conversations"><Icon name="search"/><span>Search chats</span></button>}
        {pinned.length>0&&<div className="sidebar-reveal" data-expanded={!isCollapsed} inert={isCollapsed}><div><div className="sidebar-section-label">Pinned</div><div className="sidebar-recents">{pinned.map(conversation=><Link key={conversation.id} prefetch={false} href={`/search/${conversation.id}`} onClick={close} aria-current={pathname===`/search/${conversation.id}`?'page':undefined}><Icon name="pin" size={12}/> {conversation.title}</Link>)}{pinned.length===20&&<Link href="/library?pinned=true" onClick={close}>View all pinned</Link>}</div></div></div>}
        <div className={`sidebar-section-label ${pathname === "/library" ? "is-selected" : ""}`}>
          <Link href={visitor?"/sign-in":"/library"} aria-label="Recents" onClick={close}><Icon name="clock" size={18} /><span>Recents</span></Link>
          <button className="research-icon-button sidebar-copy" inert={isCollapsed} aria-hidden={isCollapsed} aria-label={recentOpen ? "Collapse recents" : "Expand recents"} aria-expanded={recentOpen} onClick={() => setRecentOpen(!recentOpen)}><Icon name="down" size={14} /></button>
        </div>
        <div className="sidebar-reveal" data-expanded={!isCollapsed&&recentOpen} inert={isCollapsed||!recentOpen}><div className="sidebar-recents">
          {recent.length === 0 ? <p>No recent conversations</p> : recent.filter(conversation=>!conversation.pinnedAt).map((conversation) =>
            <Link key={conversation.id} prefetch={false} href={`/search/${conversation.id}`} onClick={close} title={conversation.title}
              aria-current={pathname === `/search/${conversation.id}` ? "page" : undefined}>{conversation.title}</Link>)}
          {recent.length === 20 && <Link href="/library" onClick={close}>View all</Link>}
        </div></div>
      </nav>
      <div className="sidebar-footer">
        {!visitor&&<PlanIndicator onNavigate={close}/>}
        {!visitor && <div className="sidebar-reveal" data-expanded={!isCollapsed} inert={isCollapsed}><div><div className="private-workspace"><Icon name="lock" size={12} />Private workspace</div></div></div>}
        {visitor?<GoogleSignIn compact label={isCollapsed?"Log in":"Sign up / Log in"}/>:<button className="account-button" aria-label="Open account menu" onClick={() => { close(); account.current?.showModal(); }}>
          <span className="account-avatar"><Icon name="user" size={16} /></span>
          <span className="account-name" aria-hidden={isCollapsed}>{name}<small>{data?.usage.subscription?'Pro member':data?.usage.tier==='GUEST'?'Guest trial':'Free plan'}</small></span>
        </button>}
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
      <div className="workspace-plan">{visitor||guest?<GoogleSignIn compact label="Sign up / Log in"/>:<PlanIndicator/>}</div>
      {children}
    </div>
    {searchOpen&&<QuickSearch initial={recent} onClose={()=>setSearchOpen(false)}/>}
    <dialog className="mobile-navigation" aria-label="Navigation" ref={mobileNav} onClick={(event) => { if (event.target === event.currentTarget) mobileNav.current?.close(); }}>{sidebar(false, true)}</dialog>
    {!visitor&&<dialog className="research-dialog account-dialog" aria-labelledby="account-heading" ref={account} onClick={(event) => { if (event.target === event.currentTarget) account.current?.close(); }}>
      <div className="dialog-heading"><h2 id="account-heading">Your account</h2><button className="research-icon-button" aria-label="Close account menu" onClick={() => account.current?.close()}><Icon name="close" size={17} /></button></div>
      <p>{name}</p><PlanIndicator onNavigate={()=>account.current?.close()}/>{data?.usage.subscription&&<p className="research-muted">{data.usage.subscription.reportsRemaining} Deep Research reports remaining · Access until {new Date(data.usage.subscription.endsAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</p>}{data?.usage.tier==="GUEST"&&<GoogleSignIn compact label="Sign in with Google to save guest history"/>}<p className="research-muted">Your conversations are private.</p><SessionControls />
    </dialog>}
  </div>;
}
