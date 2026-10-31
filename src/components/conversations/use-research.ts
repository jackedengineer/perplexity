"use client";
import {useModelAccess} from "./model-access";
import type {ModelKey} from "@/server/ai/catalog";
import { useCallback,useEffect,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { PUBLIC_STAGE_LABELS,publicStageEventSchema,type PublicStage } from "@/server/contracts/progress";
import { committedAnswerView,runStateView,type CommittedAnswer,type ResearchMessage } from "@/server/chat/views";
import { createResearchTransport,safeResearchMessage,savedFailureMessage } from "./research-transport";
export function useResearch(conversationId: string,revision: number,initialRunId:string|null=null) {
  const router=useRouter();
  const {key:modelKey,refresh:refreshUsage}=useModelAccess();
  const [controller]=useState(()=>createResearchTransport(()=>router.replace("/sign-in"),fetch,initialRunId));
  const stopping=useRef(false),stopRequested=useRef(false);
  const [cancelling,setCancelling]=useState(false);
  const busy=useRef(false),recovery=useRef<AbortController|null>(null);
  const [question,setQuestion]=useState(""),[pending,setPending]=useState(false),[stage,setStage]=useState<PublicStage|null>(null),[error,setError]=useState("");
  const [committed,setCommitted]=useState<CommittedAnswer|null>(null),[recovering,setRecovering]=useState(false);
  const [revealMessageId,setRevealMessageId]=useState<string>();
  const recover=useCallback(async()=>{
    if(!controller.getRunId()||recovery.current)return;
    const abort=new AbortController();recovery.current=abort;setRecovering(true);let pause=1000,resolved=false;
    try {
      const deadline=Date.now()+50000;
      while(!abort.signal.aborted&&Date.now()<deadline) {
        const response=await fetch(`/api/runs/${controller.getRunId()}`,{credentials:"same-origin",cache:"no-store",signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)])});
        if(response.status===401){resolved=true;router.replace("/sign-in");return;}
        if(!response.ok)break;
        const status=runStateView.parse(await response.json());
        if(status.conversationId!==conversationId||!controller.recordRevision(status.runId,status.revision))break;
        if(["COMPLETED","NEEDS_CLARIFICATION"].includes(status.state)&&status.answer){resolved=true;setRevealMessageId(undefined);setCommitted(status.answer);setError("");setStage(null);router.refresh();return;}
        if(status.state==="UNAVAILABLE"||["COMPLETED","NEEDS_CLARIFICATION"].includes(status.state)){resolved=true;
          setError(current=>savedFailureMessage(current,status.terminalReason));setStage(null);break;
        }
        setStage(status.state==="CHECKING_REQUEST"?null:status.state as PublicStage);
        await new Promise<void>(resolve=>{const aborted=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{abort.signal.removeEventListener("abort",aborted);resolve();},pause);abort.signal.addEventListener("abort",aborted,{once:true});});pause=Math.min(5000,pause*1.5);
      }
    } catch { /* Keep the fixed failure and the same intent available for a manual recovery. */ }
    finally {if(!resolved&&!abort.signal.aborted){setError(current=>current||"Could not confirm the saved status. Check the same request again.");setStage(null);}if(resolved)refreshUsage();recovery.current=null;setRecovering(false);setPending(false);busy.current=false;}
  },[conversationId,router,controller,refreshUsage]);
  const chat=useChat<ResearchMessage>({id:conversationId,transport:controller.transport,
    onData(part){
      if(part.type==='data-run')controller.recordRevision(part.data.runId,part.data.revision);
      if(part.type==="data-stage"){const parsed=publicStageEventSchema.safeParse(part.data);if(parsed.success&&parsed.data.runId===controller.getRunId())setStage(parsed.data.stage);}
      if(part.type==="data-answer"){const saved=committedAnswerView.parse(part.data);if(saved.conversationId!==conversationId||saved.runId!==controller.getRunId())throw new Error("Saved answer mismatch");setRevealMessageId(saved.messageId);setCommitted(saved);setStage(null);setError("");}
    },
    onError(failure){if(stopRequested.current)return;setError(safeResearchMessage(failure.message));setPending(false);busy.current=false;if(controller.getRunId())void recover();},
    onFinish({isAbort,isError}){refreshUsage();setPending(false);busy.current=false;if(!isAbort&&!isError)router.refresh();},
  });
  const {clearError,sendMessage,stop:stopChat}=chat;
  const send=useCallback(async()=>{
    const intent=controller.getIntent();if(!intent||busy.current||stopping.current)return;stopRequested.current=false;busy.current=true;setPending(true);setError("");setStage(null);clearError();
    await sendMessage({text:intent.message.text});
  },[clearError,sendMessage,controller]);
  const submit=useCallback(async(text: string,clientRequestId=crypto.randomUUID(),selectedModel:ModelKey=modelKey)=>{
    if(busy.current||!text.trim())return;
    if(!controller.getIntent()){controller.setIntent({conversationId,clientRequestId,expectedRevision:revision,message:{text},mode:"FAST",modelKey:selectedModel});setQuestion(text);}
    await send();
  },[conversationId,revision,send,controller,modelKey]);
  useEffect(()=>()=>{void stopChat();recovery.current?.abort();},[stopChat]);
  const retry=useCallback(()=>{
    if(controller.getRunId())void recover();
    else if(stopRequested.current)router.refresh();
    else void send();
  },[controller,recover,router,send]);
  async function stop(){
    if(stopping.current)return;stopping.current=true;stopRequested.current=true;setCancelling(true);
    recovery.current?.abort();
    try{
      const status=await controller.cancel();
      if(status&&status.conversationId!==conversationId)throw new Error("Saved run mismatch");
      if(status&&["COMPLETED","NEEDS_CLARIFICATION"].includes(status.state)&&status.answer){setRevealMessageId(undefined);setCommitted(status.answer);setError("");router.refresh();}
      else setError(!status||status.terminalReason==="CANCELLED"?"Research stopped. You can start a new search.":status.terminalReason==="TIMED_OUT"?"This research request timed out. You can start a new search.":"Stop requested. Check the same request for its saved status.");
    }catch{setError("Cancellation could not be confirmed. Check the same request for its saved status.");}
    // Abort only after durable cancellation; refresh the settled reservation too.
    finally{void stopChat();refreshUsage();stopping.current=false;setCancelling(false);busy.current=false;setPending(false);setStage(null);}
  }
  return {submit,retry,recover,stop:!cancelling&&(pending||recovering)?()=>void stop():undefined,question,pending:pending||recovering||cancelling,stage,label:cancelling?"Stopping research":recovering?"Checking saved result":stage?PUBLIC_STAGE_LABELS[stage]:"Checking request",error,committed,revealMessageId,revision:committed?.revision??controller.getRevision()??revision};
}
