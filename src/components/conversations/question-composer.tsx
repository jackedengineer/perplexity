"use client";
import Link from "next/link";
import {ModePicker} from "./mode-picker";
import {useStartDeep} from "./use-start-deep";
import {ModelSelector,UsageSummary,useModelAccess} from "./model-access";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResearchMark, Icon } from "./icons";
import { useStartSearch } from "./use-start-search";
import { ConversationRequestError } from "./client-api";
export function QuestionComposer({text,onText,onSubmit,pending,onStop,placeholder="Ask anything…"}: {
  text:string;onText:(value:string)=>void;onSubmit:()=>void;pending:boolean;onStop?:()=>void;placeholder?:string;
}) {
  const {data,mode,deepAvailable}=useModelAccess();
  const deep=mode==='DEEP',needsPro=deep&&data&&!data.usage.subscription;
  const available=deep?Boolean(deepAvailable&&data?.usage.subscription&&data.usage.subscription.reportsRemaining>0):Boolean(data?.models.length);
  const maximum=deep?1000:4000;
  const valid=Boolean(text.trim())&&text.length<=maximum;
  return <><ModePicker disabled={pending}/><form className="research-composer question-composer" data-has-text={Boolean(text.trim())} data-pending={pending} onSubmit={event=>{event.preventDefault();if(!pending&&available&&valid)onSubmit();}} aria-busy={pending}>
    <textarea aria-label="Ask a question" placeholder={placeholder} rows={2} maxLength={maximum} value={text} disabled={pending} onChange={event=>onText(event.target.value)}
      onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(!pending&&available&&valid)onSubmit();}}} />
    <div className="composer-toolbar">
      {!deep&&<ModelSelector disabled={pending}/>}<span className="toolbar-spacer"/>
      {deep&&<span className="deep-composer-hint">{text.length}/1,000</span>}
      {needsPro?<Link href="/pricing" className="composer-upgrade">Upgrade to Pro ↗</Link>:
      pending&&onStop ? <button className="send-button stop-button" type="button" onClick={onStop} aria-label="Stop research"><span/></button>
        : <button className="send-button" type="submit" disabled={pending||!available||!valid} aria-label="Submit question">
          <span className="submit-symbol" data-active={!pending} aria-hidden="true"><Icon name="arrow" size={18}/></span>
          <span className="submit-symbol" data-active={pending} aria-hidden="true"><span className="research-spinner"/></span>
        </button>}
    </div>
  </form>{text.length>maximum&&<p className="composer-feedback" role="alert">Shorten your question to {maximum.toLocaleString()} characters for this mode.</p>}<UsageSummary/></>;
}
export function StartQuestion({compact=false}: {compact?:boolean}) {
  const [text,setText]=useState(""),[pending,setPending]=useState(false),[error,setError]=useState("");
  const starting=useStartSearch(),startDeep=useStartDeep(),{mode}=useModelAccess(),router=useRouter();
  async function submit() {
    if(pending||!text.trim())return;setPending(true);setError("");
    try {if(mode==='DEEP')await startDeep(text);else await starting(text);}catch(failure){if(failure instanceof ConversationRequestError&&failure.status===401)router.replace("/sign-in");
      setError(mode==='DEEP'&&failure instanceof Error?failure.message:"We couldn’t confirm that it was saved. Retry to safely check the same creation request.");setPending(false);}
  }
  return <section className={compact?"next-question":"new-thread"}>
    {!compact&&<div className="new-thread-heading"><ResearchMark/><h1>A little space to think.</h1><p>Start a conversation. Follow an idea. Find something worth knowing.</p></div>}
    {!compact&&<div className="starter-prompts" aria-label="Ideas to get started">{['Explain a complex idea simply','Help me plan my next project','Compare two options before deciding'].map(prompt=><button key={prompt} onClick={()=>setText(prompt)}>{prompt}<span aria-hidden="true">↗</span></button>)}</div>}
    <QuestionComposer text={text} onText={setText} onSubmit={()=>void submit()} pending={pending} placeholder={compact?"Ask another question…":"Ask anything…"}/>
    <div className="composer-feedback" aria-live="polite">{error&&<p role="alert">{error}</p>}</div>
  </section>;
}
