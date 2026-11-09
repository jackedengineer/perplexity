'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Icon} from './icons';

type Settings={paused:boolean;instructions:string|null};
const ABOUT_LIMIT=1000;
async function memoryRequest(method:'GET'|'PATCH'|'DELETE',body?:unknown){
  const response=await fetch('/api/memory',{method,credentials:'same-origin',signal:AbortSignal.timeout(15_000),...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  if(!response.ok)throw new Error(response.status===401?'Your session ended. Please sign in again.':response.status===429?'Too many changes at once. Wait a moment and try again.':'Couldn’t save that. Please try again.');
  return (await response.json()).data;
}

// Settings only. There is deliberately no list of what Perplex remembers.
export function MemoryDialog({onClose}:{onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),confirmButton=useRef<HTMLButtonElement>(null),aboutId=useId();
  const [settings,setSettings]=useState<Settings|null>(null),[about,setAbout]=useState('');
  const [busy,setBusy]=useState(false),[confirming,setConfirming]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{
    let active=true;
    memoryRequest('GET').then((data:Settings)=>{if(active){setSettings(data);setAbout(data.instructions??'');}}).catch((failure:Error)=>{if(active)setError(failure.message);});
    return ()=>{active=false;};
  },[]);
  // Keyboard focus follows the button into its confirmation.
  useEffect(()=>{if(confirming)confirmButton.current?.focus();},[confirming]);
  async function run(work:()=>Promise<string>){
    setBusy(true);setError('');setStatus('');
    try{setStatus(await work());}catch(failure){setError(failure instanceof Error?failure.message:'Couldn’t save that. Please try again.');}finally{setBusy(false);}
  }
  const update=(body:Partial<Settings>,done:string)=>run(async()=>{const data:Settings=await memoryRequest('PATCH',body);setSettings(data);setAbout(data.instructions??'');return done;});
  const paused=settings?.paused??false,unchanged=about.trim()===(settings?.instructions??'');
  return <dialog ref={dialog} className="research-dialog memory-dialog" aria-labelledby="memory-heading" onClose={onClose} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}>
    <div className="dialog-heading"><h2 id="memory-heading">Memory</h2><button type="button" className="research-icon-button" aria-label="Close memory settings" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></div>
    <p className="research-muted">Perplex remembers things you tell it about yourself, like your work, where you live and how you like answers, so answers fit you better. It never uses them in web searches.</p>
    <label className="memory-switch">
      <span><strong>Use and save memories</strong><small className="research-muted">{settings===null?'Loading…':paused?'Paused. Answers don’t use memories and nothing new is saved.':'Answers use what you’ve told Perplex, and it keeps learning.'}</small></span>
      <input type="checkbox" role="switch" checked={!paused} disabled={settings===null||busy} onChange={event=>void update({paused:!event.target.checked},event.target.checked?'Memory is on.':'Memory is paused.')}/>
    </label>
    <form className="memory-about" onSubmit={event=>{event.preventDefault();if(!unchanged)void update({instructions:about.trim()||null},about.trim()?'Saved About you.':'Cleared About you.');}}>
      <label htmlFor={aboutId}><strong>About you</strong><small className="research-muted">Every answer takes this into account, even while memory is paused.</small></label>
      <textarea id={aboutId} rows={4} maxLength={ABOUT_LIMIT} value={about} disabled={settings===null||busy} onChange={event=>setAbout(event.target.value)}
        placeholder="For example: I’m a civil engineer in Pune. Use metric units and keep answers short."/>
      <div className="memory-about-actions"><small className="research-muted" aria-live="off">{about.length}/{ABOUT_LIMIT.toLocaleString()}</small><button type="submit" className="research-button primary" disabled={settings===null||busy||unchanged}>Save</button></div>
    </form>
    <div className="memory-delete">
      {confirming?<div className="memory-confirm" role="group" aria-label="Confirm deleting all memories">
        <p>Delete all saved memories? This can’t be undone.</p>
        <span><button ref={confirmButton} type="button" className="research-button danger" onClick={()=>{setConfirming(false);void run(async()=>{await memoryRequest('DELETE');return 'Deleted all saved memories.';});}}>Delete all</button>
        <button type="button" className="research-button" onClick={()=>setConfirming(false)}>Cancel</button></span>
      </div>:<button type="button" className="research-button danger" disabled={busy} onClick={()=>setConfirming(true)}><Icon name="trash" size={14}/>Delete all memories</button>}
    </div>
    <p className="research-muted memory-hint">To change something, just say so in a chat, like “I moved to Bengaluru”. Start a temporary chat to keep a conversation out of memory.</p>
    <div className="memory-status" role="status" aria-live="polite">{status}</div>
    {error&&<p className="files-error" role="alert">{error}</p>}
  </dialog>;
}
