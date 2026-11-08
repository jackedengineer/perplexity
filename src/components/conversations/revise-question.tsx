'use client';
import {useEffect,useRef,useState} from 'react';
import {useModelAccess} from './model-access';
import {ModelPicker} from './model-picker';
import {Icon} from './icons';
import type {ModelKey} from '@/server/ai/catalog';
// documentIds: the files the revised question is sent with, kept from the original question.
export type RevisionOptions={modelKey:ModelKey;mode:RunMode;documentIds?:string[]};
type RunMode='CHAT'|'FAST';
export function ReviseQuestion({question,files=[],action,onClose,onSubmit}:{question:string;files?:{id:string;title:string}[];action:'edit'|'retry';onClose:()=>void;onSubmit:(text:string,options:RevisionOptions)=>void}){
 const {data,key,mode,favorites,favorite}=useModelAccess();
 const [text,setText]=useState(question),[model,setModel]=useState(key),[selectedMode,setMode]=useState<RunMode>(mode==='DEEP'?'FAST':mode),[withFiles,setWithFiles]=useState(true);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();},[]);
 const selected=data?.models.find(m=>m.key===model);
 return <dialog ref={dialog} className="research-dialog revision-dialog" aria-labelledby="revision-heading" onClose={onClose} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
  <div className="dialog-heading"><h2 id="revision-heading">{action==='edit'?'Edit your question':'Try another model'}</h2><button className="research-icon-button" aria-label="Close revision" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></div>
  <p className="research-muted">Send a new turn in this chat. Your original question and answer stay saved.</p>
  <label className="revision-label" htmlFor="revision-text">Question</label><textarea id="revision-text" maxLength={4000} rows={4} value={text} onChange={e=>setText(e.target.value)}/>
  <div className="revision-options"><label>Mode <select value={selectedMode} onChange={e=>setMode(e.target.value as RunMode)}><option value="CHAT">Chat · no web search</option><option value="FAST">Web · with sources</option></select></label>
   <ModelPicker models={data?.models??[]} value={model} onSelect={setModel} favorites={favorites} onFavorite={favorite} disabled={false} inline/>
  </div>
  {files.length>0&&<label className="revision-files"><input type="checkbox" checked={withFiles} onChange={e=>setWithFiles(e.target.checked)}/>Use the same {files.length===1?'file':'files'}: {files.map(file=>file.title).join(', ')}</label>}
  <div className="dialog-footer"><span className="research-muted">{selected?.credits??'—'} credits / answer</span><button className="research-button" onClick={()=>dialog.current?.close()}>Cancel</button><button className="research-button primary" disabled={!text.trim()||!selected} onClick={()=>{onSubmit(text,{modelKey:model,mode:selectedMode,...(withFiles&&files.length?{documentIds:files.map(file=>file.id)}:{})});dialog.current?.close();}}>Send {action==='edit'?'revision':'again'}</button></div>
 </dialog>;
}
