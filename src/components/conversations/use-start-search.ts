"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { mutateConversation } from "./client-api";
import { useQuestionIntent } from "./question-intent";
export function useStartSearch() {
  const intent = useRef<{text: string;clientRequestId: string} | null>(null),router=useRouter(),questions=useQuestionIntent();
  return async(text: string)=>{
    if(intent.current?.text!==text)intent.current={text,clientRequestId:crypto.randomUUID()};
    const conversation=await mutateConversation("/api/conversations","POST",{title:"New search",clientRequestId:intent.current.clientRequestId});
    questions.stage({conversationId:conversation.id,text,clientRequestId:intent.current.clientRequestId});
    router.push(`/search/${conversation.id}`);router.refresh();
  };
}
