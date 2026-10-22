"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { PUBLIC_STAGE_LABELS,publicStageEventSchema,type PublicStage } from "@/server/contracts/progress";
import { committedAnswerView,runStateView,type CommittedAnswer,type ResearchMessage } from "@/server/chat/views";
import { createResearchTransport,safeResearchMessage } from "./research-transport";
export function useResearch(conversationId: string,revision: number) {
  const router=useRouter();
  const [controller]=useState(()=>createResearchTransport(()=>router.replace("/sign-in")));
  const busy=useRef(false),recovery=useRef<AbortController|null>(null);
  const [question,setQuestion]=useState(""),[pending,setPending]=useState(false),[stage,setStage]=useState<PublicStage|null>(null),[error,setError]=useState("");
  const [committed,setCommitted]=useState<CommittedAnswer|null>(null),[recovering,setRecovering]=useState(false);
  const recover=useCallback(async()=>{
    if(!controller.getRunId()||recovery.current)return;
    const abort=new AbortController();recovery.current=abort;setRecovering(true);let pause=1000;
    try {
      const deadline=Date.now()+50000;
      while(!abort.signal.aborted&&Date.now()<deadline) {
        const response=await fetch(`/api/runs/${controller.getRunId()}`,{credentials:"same-origin",cache:"no-store",signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)])});
        if(response.status===401){router.replace("/sign-in");return;}
        if(!response.ok)break;
        const status=runStateView.parse(await response.json());
        if(status.conversationId!==conversationId)break;
        if(status.state==="COMPLETED"&&status.answer){setCommitted(status.answer);setError("");setStage(null);router.refresh();return;}
        if(status.state==="UNAVAILABLE"||status.state==="COMPLETED")break;
        setStage(status.state==="CHECKING_REQUEST"?null:status.state);
        await new Promise<void>(resolve=>{const aborted=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{abort.signal.removeEventListener("abort",aborted);resolve();},pause);abort.signal.addEventListener("abort",aborted,{once:true});});pause=Math.min(5000,pause*1.5);
      }
    } catch { /* Keep the fixed failure and the same intent available for a manual recovery. */ }
    finally {recovery.current=null;setRecovering(false);setPending(false);busy.current=false;}
  },[conversationId,router,controller]);
  const chat=useChat<ResearchMessage>({id:conversationId,transport:controller.transport,
    onData(part){
      if(part.type==="data-stage"){const parsed=publicStageEventSchema.safeParse(part.data);if(parsed.success&&parsed.data.runId===controller.getRunId())setStage(parsed.data.stage);}
      if(part.type==="data-answer"){const saved=committedAnswerView.parse(part.data);if(saved.conversationId!==conversationId||saved.runId!==controller.getRunId())throw new Error("Saved answer mismatch");setCommitted(saved);setStage(null);setError("");}
    },
    onError(failure){setError(safeResearchMessage(failure.message));setPending(false);busy.current=false;if(controller.getRunId())void recover();},
    onFinish({isAbort,isError}){setPending(false);busy.current=false;if(!isAbort&&!isError)router.refresh();},
  });
  const {clearError,sendMessage,stop:stopChat}=chat;
  const send=useCallback(async()=>{
    const intent=controller.getIntent();if(!intent||busy.current)return;busy.current=true;setPending(true);setError("");setStage(null);clearError();
    await sendMessage({text:intent.message.text});
  },[clearError,sendMessage,controller]);
  const submit=useCallback(async(text: string,clientRequestId=crypto.randomUUID())=>{
    if(busy.current||!text.trim())return;
    if(!controller.getIntent()){controller.setIntent({conversationId,clientRequestId,expectedRevision:revision,message:{text},mode:"FAST",modelKey:"fast-default"});setQuestion(text);}
    await send();
  },[conversationId,revision,send,controller]);
  useEffect(()=>()=>{void stopChat();recovery.current?.abort();},[stopChat]);
  function stop(){void stopChat();recovery.current?.abort();busy.current=false;setPending(false);setError("Research stopped. Check for a saved result before trying again.");}
  return {submit,retry:send,recover,stop,question,pending:pending||recovering,stage,label:stage?PUBLIC_STAGE_LABELS[stage]:recovering?"Checking saved result":"Checking request",error,committed};
}
