"use client";
import { useState } from "react";
import Link from "next/link";
import type { Conversation,HistoryPage } from "@/server/conversations/views";
import type { CommittedAnswer } from "@/server/chat/views";
import { Icon,ResearchMark } from "./icons";
import { ConversationActions } from "./conversation-actions";
import { ConversationHistory } from "./conversation-history";
import { QuestionComposer,StartQuestion } from "./question-composer";
export type ResearchState={question:string;pending:boolean;error:string;label:string;committed:CommittedAnswer|null;retry:()=>void;stop?:()=>void};
export const idleResearch: ResearchState={question:"",pending:false,error:"",label:"Checking request",committed:null,retry:()=>{}};
export function ThreadView({conversation,initial,research=idleResearch,submit}: {conversation:Conversation;initial:HistoryPage;research?:ResearchState;submit:(text:string)=>void}) {
  const [text,setText]=useState(""),[sourcesOpen,setSourcesOpen]=useState(false);
  const saved=research.committed;
  let history=initial;
  if(saved&&!initial.items.some(message=>message.id===saved.messageId)){
    const now=saved.createdAt;
    history={...initial,items:[...initial.items,
      ...(!initial.items.some(message=>message.role==="USER")?[{id:saved.runId,role:"USER" as const,kind:"QUESTION" as const,parts:[{type:"text" as const,text:research.question}],sequence:1,schemaVersion:1 as const,createdAt:now}]:[]),
      {id:saved.messageId,role:"ASSISTANT",kind:saved.answer.kind==="CLARIFICATION"?"CLARIFICATION":"ANSWER",parts:[{type:"text",text:saved.text}],sequence:2,schemaVersion:1,createdAt:now,answer:saved.answer}]};
  }
  const hasAnswer=history.items.some(message=>message.role==="ASSISTANT"),hasQuestion=history.items.some(message=>message.role==="USER");
  return <main id="main" className={`thread-page ${hasAnswer||research.question?"active-thread":""}`}>
    <header className="research-topbar answer-topbar"><span className="thread-tab"><ResearchMark/>Answer</span>
      {history.items.some(message=>message.answer?.sources.length)&&<button className="answer-tab-button" aria-pressed={sourcesOpen} onClick={()=>setSourcesOpen(!sourcesOpen)}><Icon name="link" size={16}/>Sources</button>}
      <span className="toolbar-spacer"/><ConversationActions conversation={conversation} renameUnavailable={research.pending}/><span className="private-pill" role="img" aria-label="Private conversation" title="Private conversation"><Icon name="lock" size={13}/><span className="private-label">Private</span></span>
    </header>
    <section className="thread-content" aria-label="Conversation history" tabIndex={0}>
      <h1>{conversation.title}</h1>
      {history.items.length>0&&<ConversationHistory key={`${saved?.messageId??"saved"}:${initial.items.length}`} conversationId={conversation.id} initial={history} sourcesOpen={sourcesOpen} onSourcesOpenChange={setSourcesOpen}/>}
      {research.question&&!hasQuestion&&!saved&&<article className="history-message question-message pending-question" aria-label="Your question"><p>{research.question}</p></article>}
      {research.pending&&<div className="research-progress" role="status" aria-live="polite"><span className="progress-mark" aria-hidden="true"><ResearchMark/></span><span>{research.label}</span><div className="answer-skeleton" aria-hidden="true"><span/><span/><span/></div></div>}
      {research.error&&!saved&&<div className="research-failure"><p role="alert">{research.error}</p><div className="failure-actions">
        <button className="research-button" disabled={research.pending} onClick={()=>void research.retry()}>Check same request</button>
        <Link className="research-button" href="/workspace">New search</Link>
      </div></div>}
      {!history.items.length&&!research.question&&<div className="thread-empty"><Icon name="search" size={24}/><h2>What would you like to explore?</h2><p>Ask a question to search the web and get an answer with sources.</p></div>}
    </section>
    <div className="thread-bottom">
      {research.pending?<QuestionComposer text="" onText={()=>{}} onSubmit={()=>{}} pending onStop={research.stop} placeholder={research.label}/>
        :hasAnswer||research.question||hasQuestion?<StartQuestion compact/>
        :<QuestionComposer text={text} onText={setText} onSubmit={()=>void submit(text)} pending={false}/>}
    </div>
  </main>;
}
