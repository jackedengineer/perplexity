"use client";
import {ModelSelector,UsageSummary,useModelAccess} from "./model-access";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { useStartSearch } from "./use-start-search";
import { ConversationRequestError } from "./client-api";
export function QuestionComposer({text,onText,onSubmit,pending,onStop,placeholder="Ask anything…"}: {
  text:string;onText:(value:string)=>void;onSubmit:()=>void;pending:boolean;onStop?:()=>void;placeholder?:string;
}) {
  const {data}=useModelAccess();
  const available=Boolean(data?.models.length);
  return <><form className="research-composer question-composer" onSubmit={event=>{event.preventDefault();if(!pending&&available&&text.trim())onSubmit();}} aria-busy={pending}>
    <textarea aria-label="Ask a question" placeholder={placeholder} rows={2} maxLength={4000} value={text} disabled={pending} onChange={event=>onText(event.target.value)}
      onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(!pending&&available&&text.trim())onSubmit();}}} />
    <div className="composer-toolbar">
      <button className="research-icon-button" type="button" disabled aria-label="Attachments are not available yet"><Icon name="plus" size={18}/></button>
      <span className="composer-mode"><Icon name="search" size={14}/>Search<Icon name="down" size={12}/></span>
      <span className="toolbar-spacer"/><ModelSelector disabled={pending}/>
      <button className="research-icon-button voice-control" type="button" disabled aria-label="Voice input is not available yet"><Icon name="microphone" size={16}/></button>
      {pending&&onStop ? <button className="send-button stop-button" type="button" onClick={onStop} aria-label="Stop research"><span/></button>
        : <button className="send-button" type="submit" disabled={pending||!available||!text.trim()} aria-label="Submit question">{pending ? <span className="research-spinner"/>:<Icon name="arrow" size={18}/>}</button>}
    </div>
  </form><UsageSummary/></>;
}
export function StartQuestion({compact=false}: {compact?:boolean}) {
  const [text,setText]=useState(""),[pending,setPending]=useState(false),[error,setError]=useState("");
  const starting=useStartSearch(),router=useRouter();
  async function submit() {
    if(pending||!text.trim())return;setPending(true);setError("");
    try {await starting(text);}catch(failure){if(failure instanceof ConversationRequestError&&failure.status===401)router.replace("/sign-in");
      setError("We couldn’t confirm that it was saved. Retry to safely check the same creation request.");setPending(false);}
  }
  return <section className={compact?"next-question":"new-thread"}>
    {!compact&&<div className="new-thread-heading"><span>Search</span><h1>What do you want to know?</h1></div>}
    <QuestionComposer text={text} onText={setText} onSubmit={()=>void submit()} pending={pending} placeholder={compact?"Ask another question…":"Ask anything…"}/>
    <div className="composer-feedback" aria-live="polite">{error&&<p role="alert">{error}</p>}</div>
  </section>;
}
