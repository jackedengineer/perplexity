'use client';
import {useCallback,useEffect,useId,useState} from 'react';
import {feedbackView,type FeedbackView} from '@/server/feedback/view';
import {Icon} from './icons';
import {queueFeedbackRead} from './feedback-read-queue';
export default function AnswerFeedback({messageId}:{messageId:string}){
 const [saved,setSaved]=useState<FeedbackView|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),id=useId();
 const load=useCallback(async(signal?:AbortSignal)=>{
  const response=await queueFeedbackRead(()=>fetch(`/api/messages/${messageId}/feedback`,{credentials:'same-origin',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)}),signal);
  if(!response.ok)throw Error('Feedback unavailable');if(signal?.aborted)return;setSaved(feedbackView.parse(await response.json()));setError('');
 },[messageId]);
 useEffect(()=>{const controller=new AbortController();queueMicrotask(()=>{if(!controller.signal.aborted)void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setError('Feedback couldn’t load.');});});return()=>controller.abort();},[load]);
 async function save(rating:NonNullable<FeedbackView['rating']>,reason:FeedbackView['reason']){
  if(!saved||pending)return;setPending(true);setError('');
  try{
   const response=await fetch(`/api/messages/${messageId}/feedback`,{method:'PUT',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating,reason,expectedVersion:saved.version}),signal:AbortSignal.timeout(8000)});
   if(response.status===409){await load();setError('Feedback changed in another tab. Try again.');return;}
   if(!response.ok)throw Error('Feedback unavailable');setSaved(feedbackView.parse(await response.json()));
  }catch{setError('Feedback wasn’t confirmed. Retry to check it safely.');}finally{setPending(false);}
 }
 return <div className="answer-feedback" aria-label="Answer feedback" aria-busy={pending}>
  <div className="feedback-buttons">
   <button className="research-icon-button" aria-label="Helpful answer" aria-pressed={saved?.rating==='HELPFUL'} disabled={!saved||pending} onClick={()=>void save('HELPFUL',null)}><Icon name="thumbUp" size={17}/></button>
   <button className="research-icon-button" aria-label="Unhelpful answer" aria-pressed={saved?.rating==='NOT_HELPFUL'} disabled={!saved||pending} onClick={()=>void save('NOT_HELPFUL',saved?.reason??null)}><Icon name="thumbDown" size={17}/></button>
   <span className="feedback-status sr-only" role="status">{pending?'Saving feedback…':saved?.rating?'Feedback saved':''}</span>
  </div>
  {saved?.rating==='NOT_HELPFUL'&&<label className="feedback-reason" htmlFor={id}>What could be better?<select id={id} disabled={pending} value={saved.reason??''} onChange={event=>void save('NOT_HELPFUL',event.target.value as FeedbackView['reason']||null)}>
   <option value="">Choose a reason (optional)</option><option value="MISSING_EVIDENCE">Missing evidence</option><option value="WRONG_INTERPRETATION">Wrong interpretation</option><option value="FALSE_REFUSAL">False refusal</option>
  </select></label>}
  {error&&<p className="feedback-error" role="alert">{error} <button className="feedback-retry" onClick={()=>void load().catch(()=>setError('Feedback couldn’t load.'))}>Reload feedback</button></p>}
 </div>;
}
