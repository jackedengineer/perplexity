"use client";
import {useModelAccess} from "./model-access";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { mutateConversation } from "./client-api";
import { useQuestionIntent } from "./question-intent";
export function useStartSearch() {
  const {key:modelKey,mode}=useModelAccess();
  const intent = useRef<{text: string;modelKey:string;mode:string;files:string;clientRequestId: string} | null>(null),router=useRouter(),questions=useQuestionIntent();
  return async(text: string,documentIds:string[]=[])=>{
    // A retry of the same question with the same files reuses its creation request.
    const files=documentIds.join(",");
    if(intent.current?.text!==text||intent.current.modelKey!==modelKey||intent.current.mode!==mode||intent.current.files!==files)intent.current={text,modelKey,mode,files,clientRequestId:crypto.randomUUID()};
    const conversation=await mutateConversation("/api/conversations","POST",{title:"New search",clientRequestId:intent.current.clientRequestId});
    questions.stage({mode:mode==='DEEP'?'FAST':mode,modelKey,conversationId:conversation.id,text,clientRequestId:intent.current.clientRequestId,...(documentIds.length?{documentIds}:{})});
    router.push(`/search/${conversation.id}`);router.refresh();
  };
}
