"use client";
import { useEffect,useRef } from "react";
import type { Conversation,HistoryPage } from "@/server/conversations/views";
import type { PendingQuestion } from "./question-intent";
import { useResearch } from "./use-research";
import { ThreadView } from "./thread-view";
export default function ActiveResearch({conversation,initial,question,runId,onFollowUp}: {conversation:Conversation;initial:HistoryPage;question?:PendingQuestion&{expectedRevision?:number};runId?:string;onFollowUp:(text:string,expectedRevision?:number)=>void}) {
  const research=useResearch(conversation.id,question?.expectedRevision??conversation.revision,question?undefined:runId),{submit,recover}=research,launched=useRef(false);
  useEffect(()=>{let disposed=false;queueMicrotask(()=>{if(!disposed&&!launched.current){launched.current=true;if(question)void submit(question.text,question.clientRequestId);else void recover();}});return()=>{disposed=true;};},[question,submit,recover]);
  return <ThreadView conversation={conversation} initial={initial} research={research} submit={text=>onFollowUp(text,research.committed?.revision??conversation.revision)}/>;
}
