'use client';
import {useState} from 'react';
import type {ClarificationView} from '@/server/deep-research/scope';
export function ResearchClarification({value,busy,onContinue}:{value:ClarificationView;busy:boolean;onContinue:(answers:{id:'Q1'|'Q2';answer:string}[])=>Promise<void>}){
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const ready=value.questions.every(q=>answers[q.id]?.trim());
 return <section className="jobs-card research-clarification" aria-labelledby="clarification-title">
  <h2 id="clarification-title">A quick clarification</h2><p>These details change the direction of the research. No searches have run and your report allowance is unchanged.</p>
  {value.canContinue?<form onSubmit={e=>{e.preventDefault();if(ready&&!busy)void onContinue(value.questions.map(q=>({id:q.id,answer:answers[q.id].trim()})));}}>
   {value.questions.map(q=><fieldset key={q.id} disabled={busy}><legend>{q.question}</legend>
    {q.options.length>0&&<div className="clarification-options">{q.options.map(option=><button key={option} type="button" aria-pressed={answers[q.id]===option} onClick={()=>setAnswers(v=>({...v,[q.id]:option}))}>{option}</button>)}</div>}
    <textarea aria-label={q.question} value={answers[q.id]??''} maxLength={200} rows={2} placeholder="Choose an option or write your answer…" onChange={e=>setAnswers(v=>({...v,[q.id]:e.target.value}))}/>
   </fieldset>)}
   <button className="jobs-primary" disabled={!ready||busy}>{busy?'Saving answers…':'Continue research'}</button>
  </form>:<div className="jobs-note"><p>The scope is still unclear after two follow-ups. Start a new question that answers:</p><ul>{value.questions.map(q=><li key={q.id}>{q.question}</li>)}</ul></div>}
 </section>;
}
