'use client';
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {CommittedAnswer} from '@/server/chat/views';
import {prepareAnswerReveal,revealUnitsAt} from './answer-reveal';
const motionQuery='(prefers-reduced-motion: reduce)';
function subscribeMotion(notify:()=>void){const query=window.matchMedia(motionQuery);query.addEventListener('change',notify);return()=>query.removeEventListener('change',notify);}
const reducedMotion=()=>window.matchMedia(motionQuery).matches;
export function useAnswerReveal(answer:CommittedAnswer|null) {
 const reduced=useSyncExternalStore(subscribeMotion,reducedMotion,()=>true);
 const model=useMemo(()=>answer?prepareAnswerReveal(answer.answer.document):null,[answer]);
 const id=answer?.messageId??null,finished=useRef<string|null>(null),frame=useRef<number|null>(null);
 const [progress,setProgress]=useState<{id:string|null;units:number}>({id:null,units:0});
 const finish=useCallback(()=>{
  if(!id||!model)return;
  finished.current=id;if(frame.current!==null)cancelAnimationFrame(frame.current);
  setProgress({id,units:model.total});
 },[id,model]);
 useEffect(()=>{
  if(!id||!model||finished.current===id)return;
  let disposed=false;const started=performance.now();
  if(reduced||document.hidden){queueMicrotask(()=>{if(!disposed)finish();});return()=>{disposed=true;};}
  const visibility=()=>{if(document.hidden)finish();};
  function tick(now:number){
   if(disposed||finished.current===id)return;
   const units=revealUnitsAt(model!.total,now-started);
   setProgress(current=>current.id===id&&current.units>=units?current:{id,units});
   if(units<model!.total)frame.current=requestAnimationFrame(tick);else finished.current=id;
  }
  frame.current=requestAnimationFrame(tick);document.addEventListener('visibilitychange',visibility);
  return()=>{disposed=true;if(frame.current!==null)cancelAnimationFrame(frame.current);document.removeEventListener('visibilitychange',visibility);};
 },[id,model,reduced,finish]);
 if(!answer||!model)return undefined;
 const units=reduced?model.total:progress.id===id?progress.units:0;
 return {messageId:answer.messageId,document:model.slice(units),active:units<model.total,finish};
}
export type AnswerReveal=ReturnType<typeof useAnswerReveal>;
