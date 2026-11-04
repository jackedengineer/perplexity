'use client';
import {useState} from 'react';
import {GuestSignIn} from '@/components/guest-sign-in';
import {GoogleSignIn} from '@/components/google-sign-in';
import {ResearchMark,Icon} from './icons';

import {WORKSPACE_DRAFT_KEY} from './workspace-draft';
export function VisitorQuestion({guestEnabled,siteKey}: {guestEnabled:boolean;siteKey?:string}) {
  const [text,setText]=useState(''),[trial,setTrial]=useState(false);
  function update(value:string) {
    setText(value);
    try { sessionStorage.setItem(WORKSPACE_DRAFT_KEY,value); } catch { /* Restricted storage remains usable. */ }
  }
  return <section className="new-thread visitor-question">
    <div className="new-thread-heading"><ResearchMark/><h1>A little space to think.</h1><p>Start a conversation. Follow an idea. Find something worth knowing.</p></div>
    <form className="research-composer question-composer" onSubmit={e=>{e.preventDefault();if(guestEnabled)setTrial(true);}}>
      <textarea aria-label="Ask a question" placeholder="Ask anything…" rows={2} maxLength={4000} value={text} onChange={e=>update(e.target.value)}/>
      <div className="composer-toolbar"><span className="visitor-mode">Web search</span><span className="toolbar-spacer"/>
        {guestEnabled?<button className="send-button" type="submit" aria-label="Start guest trial"><Icon name="arrow" size={18}/></button>:<GoogleSignIn compact label="Sign in to send"/>}
      </div>
    </form>
    <p className="usage-summary">{guestEnabled?'Try ten answers a day, or sign in to save your conversations.':'Sign in to start researching and save your conversations.'}</p>
    {trial&&<div className="visitor-trial"><GuestSignIn siteKey={siteKey}/></div>}
  </section>;
}
