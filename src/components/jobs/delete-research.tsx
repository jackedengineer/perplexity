'use client';
import {useEffect,useRef,useState} from 'react';
export function DeleteResearch({id,disabled,onDeleted}:{id:string;disabled:boolean;onDeleted:()=>void}){
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const trigger=useRef<HTMLButtonElement>(null),cancel=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(confirm)cancel.current?.focus();},[confirm]);
 async function remove(){
  if(busy||disabled)return;setBusy(true);setError('');
  try{
   const response=await fetch(`/api/jobs/${id}/delete`,{method:'POST'});
   const result=await response.json();
   if(!response.ok||result.removed!==true)throw new Error('Deletion is not confirmed. Please try again.');
   onDeleted();
  }catch{setError('Deletion is not confirmed. Please try again.');setBusy(false);}
 }
 return <section className="jobs-card" aria-label="Research privacy"><h2>Your saved research</h2>
  <p className="jobs-note">Export a completed report before deleting it. Usage and billing records are retained.</p>
  <button ref={trigger} className="jobs-stop" disabled={disabled||busy} aria-expanded={confirm} onClick={()=>setConfirm(v=>!v)}>Delete research</button>
  {confirm&&<div role="group" aria-label="Confirm research deletion"><p className="jobs-note" role="alert">This stops active work and permanently deletes this question, report and saved source excerpts. This cannot be undone.</p>
   <div className="jobs-actions"><button ref={cancel} className="jobs-stop" disabled={busy} onClick={()=>{setConfirm(false);setError('');trigger.current?.focus();}}>Keep research</button><button className="jobs-stop" disabled={busy||disabled} onClick={remove}>{busy?'Deleting…':'Delete permanently'}</button></div>
  </div>}
  {error&&<p className="jobs-error" role="alert">{error}</p>}
 </section>;
}
