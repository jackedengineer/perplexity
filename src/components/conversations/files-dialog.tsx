'use client';
import {useEffect,useRef,useState} from 'react';
import {Icon} from './icons';
import {useDocuments,type UserDocument} from './documents';

export const fileSize=(bytes:number)=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${Number((bytes/1024/1024).toFixed(1))} MB`;
function statusText(document:UserDocument){
  if(document.status==='READY')return `${document.pageCount} ${document.pageCount===1?'page':'pages'} · ${fileSize(document.byteSize)}`;
  if(document.status==='PROCESSING')return 'Preparing for questions…';
  return document.failure==='UNREADABLE'?'No readable text found':'Couldn’t prepare this file. Delete it and upload again.';
}

export function FilesDialog({onClose}:{onClose:()=>void}){
  const {documents,limits,loaded,error,upload,remove}=useDocuments();
  const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null);
  const [uploading,setUploading]=useState(''),[messages,setMessages]=useState<string[]>([]),[confirming,setConfirming]=useState<string|null>(null),[announcement,setAnnouncement]=useState('');
  const confirmButton=useRef<HTMLButtonElement>(null),statuses=useRef(new Map<string,string>());
  useEffect(()=>{dialog.current?.showModal();},[]);
  // Keyboard focus follows the trash button into its confirmation.
  useEffect(()=>{if(confirming)confirmButton.current?.focus();},[confirming]);
  // Announces a file finishing preparation, which otherwise changes silently.
  useEffect(()=>{
    const finished=documents.filter(document=>statuses.current.get(document.id)==='PROCESSING'&&document.status!=='PROCESSING');
    for(const document of documents)statuses.current.set(document.id,document.status);
    if(finished.length)queueMicrotask(()=>setAnnouncement(finished.map(document=>`${document.title} ${document.status==='READY'?'is ready':'couldn’t be prepared'}.`).join(' ')));
  },[documents]);
  const full=Boolean(limits&&documents.length>=limits.maxDocuments);
  async function choose(files:FileList|null){
    const problems:string[]=[];
    for(const file of Array.from(files??[])){
      // The server enforces every limit; these checks only save a pointless upload.
      if(file.type&&file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){problems.push(`${file.name} isn’t a PDF.`);continue;}
      if(limits&&file.size>limits.maxBytes){problems.push(`${file.name} is larger than ${fileSize(limits.maxBytes)}.`);continue;}
      setUploading(file.name);
      const result=await upload(file);
      if('error' in result)problems.push(`${file.name}: ${result.error}`);
    }
    setMessages(problems);setUploading('');
    if(input.current)input.current.value='';
  }
  async function confirmRemove(id:string){
    setConfirming(null);
    const problem=await remove(id);
    setMessages(problem?[problem]:[]);
  }
  return <dialog ref={dialog} className="research-dialog files-dialog" aria-labelledby="files-heading" onClose={onClose} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}>
    <div className="dialog-heading"><h2 id="files-heading">Your files</h2><button type="button" className="research-icon-button" aria-label="Close files" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></div>
    <p className="research-muted">Attach a PDF to any question in Chat or Web. Answers cite the file and page. Your files stay private to your account.</p>
    <div className="files-actions">
      <input ref={input} id="files-input" className="files-input" type="file" aria-label="Choose PDF files" tabIndex={-1} accept="application/pdf,.pdf" multiple onChange={event=>void choose(event.target.files)} disabled={Boolean(uploading)||full}/>
      <button type="button" className="research-button primary" onClick={()=>input.current?.click()} disabled={Boolean(uploading)||full}><Icon name="upload" size={14}/>Upload PDF</button>
      <span className="research-muted files-limits">{limits?`Up to ${limits.maxDocuments} PDFs, ${fileSize(limits.maxBytes)} and ${limits.maxPages} pages each. Scanned PDFs aren’t supported yet.`:''}</span>
    </div>
    <div className="files-feedback" role="status" aria-live="polite">{uploading?`Uploading ${uploading}…`:announcement}</div>
    {messages.length>0&&<div className="files-error" role="alert">{messages.map(message=><p key={message}>{message}</p>)}</div>}
    {!loaded?<p className="research-muted files-empty">Loading your files…</p>:error?<p className="files-error" role="alert">{error}</p>:
    !documents.length?<p className="research-muted files-empty">No files yet. Upload a PDF to ask questions about it.</p>:
    <ul className="files-list" aria-label="Uploaded files">{documents.map(document=><li key={document.id} className="file-row" data-status={document.status}>
      <Icon name="file" size={16}/>
      <div className="file-details">
        {document.status==='READY'?<a href={`/api/documents/${document.id}/file`} target="_blank" rel="noopener noreferrer" className="file-title">{document.title}</a>:<span className="file-title">{document.title}</span>}
        <small className="file-status">{document.status==='PROCESSING'&&<span className="research-spinner" aria-hidden="true"/>}{statusText(document)}</small>
      </div>
      {confirming===document.id?<span className="file-confirm">
        <button ref={confirmButton} type="button" className="research-button danger" onClick={()=>void confirmRemove(document.id)}>Delete</button>
        <button type="button" className="research-button" onClick={()=>setConfirming(null)}>Cancel</button>
      </span>:<button type="button" className="research-icon-button" aria-label={`Delete ${document.title}`} onClick={()=>setConfirming(document.id)}><Icon name="trash" size={15}/></button>}
    </li>)}</ul>}
    {full&&<p className="research-muted">You’ve reached the {limits?.maxDocuments}-file limit. Delete a file to upload another.</p>}
  </dialog>;
}
