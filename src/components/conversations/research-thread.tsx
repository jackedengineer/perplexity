"use client";
import type {RevisionOptions} from "./revise-question";
import {useModelAccess} from "./model-access";
import { lazy,Suspense,useEffect,useState } from "react";
import type { Conversation,HistoryPage } from "@/server/conversations/views";
import { useQuestionIntent,type PendingQuestion } from "./question-intent";
import { ThreadView,idleResearch } from "./thread-view";
const ActiveResearch=lazy(()=>import("./active-research"));
export function ResearchThread({conversation,initial,activeRunId}: {conversation:Conversation;initial:HistoryPage;activeRunId?:string}) {
  const {key:modelKey,mode,select,setMode}=useModelAccess();
  const [ready,setReady]=useState(false);
  const [question,setQuestion]=useState<(PendingQuestion&{expectedRevision?:number})|null>(null),{consume}=useQuestionIntent();
  // Files stay attached for follow-ups in this conversation until the user removes them,
  // starting from the latest question that had any.
  const [attachments,setAttachments]=useState<string[]>(()=>[...initial.items].reverse().find(item=>item.role==='USER')?.attachments?.map(file=>file.id)??[]);
  useEffect(()=>{let disposed=false;queueMicrotask(()=>{if(disposed)return;const next=consume(conversation.id);if(next){setQuestion(next);if(next.mode)setMode(next.mode==='DOCUMENTS'?'CHAT':next.mode);if(next.modelKey)select(next.modelKey);if(next.documentIds)setAttachments(next.documentIds);}setReady(true);});return()=>{disposed=true;};},[conversation.id,consume,select,setMode]);
  const submit=(text:string,expectedRevision?:number,options?:RevisionOptions)=>{
    const chosen=options?.mode??(mode==='DEEP'?'FAST':mode),documentIds=options?options.documentIds:attachments;
    setQuestion({mode:chosen,modelKey:options?.modelKey??modelKey,expectedRevision,conversationId:conversation.id,text,clientRequestId:crypto.randomUUID(),...(documentIds?.length?{documentIds}:{})});
  };
  const files={attachments,onAttachments:setAttachments};
  if(!ready)return <ThreadView conversation={conversation} initial={initial} submit={()=>{}} research={{...idleResearch,pending:Boolean(activeRunId),label:"Checking saved result"}} {...files}/>;
  if(!question&&!activeRunId)return <ThreadView conversation={conversation} initial={initial} submit={(text,options)=>submit(text,undefined,options)} {...files}/>;
  return <Suspense fallback={<ThreadView conversation={conversation} initial={initial} submit={()=>{}} research={{...idleResearch,question:question?.text??"",pending:true}} {...files}/>}>
    <ActiveResearch key={question?.clientRequestId??activeRunId} onFollowUp={submit} conversation={conversation} initial={initial} question={question??undefined} runId={activeRunId} {...files}/>
  </Suspense>;
}
