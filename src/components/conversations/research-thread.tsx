"use client";
import { lazy,Suspense,useEffect,useState } from "react";
import type { Conversation,HistoryPage } from "@/server/conversations/views";
import { useQuestionIntent,type PendingQuestion } from "./question-intent";
import { ThreadView,idleResearch } from "./thread-view";
const ActiveResearch=lazy(()=>import("./active-research"));
export function ResearchThread({conversation,initial}: {conversation:Conversation;initial:HistoryPage}) {
  const [question,setQuestion]=useState<PendingQuestion|null>(null),{consume}=useQuestionIntent();
  useEffect(()=>{let disposed=false;queueMicrotask(()=>{if(disposed)return;const next=consume(conversation.id);if(next)setQuestion(next);});return()=>{disposed=true;};},[conversation.id,consume]);
  const submit=(text:string)=>setQuestion({conversationId:conversation.id,text,clientRequestId:crypto.randomUUID()});
  if(!question)return <ThreadView conversation={conversation} initial={initial} submit={submit}/>;
  return <Suspense fallback={<ThreadView conversation={conversation} initial={initial} submit={()=>{}} research={{...idleResearch,question:question.text,pending:true}}/>}>
    <ActiveResearch conversation={conversation} initial={initial} question={question}/>
  </Suspense>;
}
