'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from './icons';
import {readyDocuments,useDocuments,type UserDocument} from './documents';

const size=(bytes:number)=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${Number((bytes/1024/1024).toFixed(1))} MB`;
function statusText(document:UserDocument){
  if(document.status==='READY')return `${document.pageCount} ${document.pageCount===1?'page':'pages'} · ${size(document.byteSize)}`;
  if(document.status==='PROCESSING')return 'Preparing for questions…';
  return document.failure==='UNREADABLE'?'No readable text found':'Couldn’t prepare this file. Delete it and upload again.';
}

// Toolbar entry point for Files mode: shows how many files are ready and opens the list.
export function FilesButton({disabled}:{disabled:boolean}){
  const {documents}=useDocuments(),[open,setOpen]=useState<HTMLElement|null>(null);
  const ready=readyDocuments(documents);
  return <>
    <button type="button" className="files-trigger" disabled={disabled} onClick={event=>setOpen(event.currentTarget.closest<HTMLElement>('.research-shell')??document.body)} aria-haspopup="dialog">
      <Icon name="file" size={14}/><span>{ready?`${ready} ${ready===1?'file':'files'}`:'Add files'}</span>
    </button>
    {/* Portalled out of the composer form, so no control in the dialog can submit the question,
        but kept inside the research shell, which provides the theme. */}
    {open&&createPortal(<FilesDialog onClose={()=>setOpen(null)}/>,open)}
  </>;
}

export function FilesDialog({onClose}:{onClose:()=>void}){
  const {documents,limits,loaded,error,upload,remove}=useDocuments();
  const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null);
  const [uploading,setUploading]=useState(''),[message,setMessage]=useState(''),[confirming,setConfirming]=useState<string|null>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const full=Boolean(limits&&documents.length>=limits.maxDocuments);
  async function choose(files:FileList|null){
    setMessage('');
    for(const file of Array.from(files??[])){
      // The server enforces every limit; these checks only save a pointless upload.
      if(file.type&&file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){setMessage(`${file.name} isn’t a PDF.`);continue;}
      if(limits&&file.size>limits.maxBytes){setMessage(`${file.name} is larger than ${size(limits.maxBytes)}.`);continue;}
      setUploading(file.name);
      const problem=await upload(file);
      if(problem)setMessage(`${file.name}: ${problem}`);
    }
    setUploading('');
    if(input.current)input.current.value='';
  }
  async function confirmRemove(id:string){
    setConfirming(null);
    const problem=await remove(id);
    if(problem)setMessage(problem);
  }
  return <dialog ref={dialog} className="research-dialog files-dialog" aria-labelledby="files-heading" onClose={onClose} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}}>
    <div className="dialog-heading"><h2 id="files-heading">Your files</h2><button type="button" className="research-icon-button" aria-label="Close files" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></div>
    <p className="research-muted">Ask questions about your PDFs in Files mode. Answers cite the file and page. Your files stay private to your account.</p>
    <div className="files-actions">
      <input ref={input} id="files-input" className="files-input" type="file" aria-label="Choose PDF files" tabIndex={-1} accept="application/pdf,.pdf" multiple onChange={event=>void choose(event.target.files)} disabled={Boolean(uploading)||full}/>
      <button type="button" className="research-button primary" onClick={()=>input.current?.click()} disabled={Boolean(uploading)||full}><Icon name="upload" size={14}/>Upload PDF</button>
      <span className="research-muted files-limits">{limits?`Up to ${limits.maxDocuments} PDFs, ${size(limits.maxBytes)} and ${limits.maxPages} pages each. Scanned PDFs aren’t supported yet.`:''}</span>
    </div>
    <div className="files-feedback" role="status" aria-live="polite">{uploading?`Uploading ${uploading}…`:''}</div>
    {message&&<p className="files-error" role="alert">{message}</p>}
    {!loaded?<p className="research-muted files-empty">Loading your files…</p>:error?<p className="files-error" role="alert">{error}</p>:
    !documents.length?<p className="research-muted files-empty">No files yet. Upload a PDF to ask questions about it.</p>:
    <ul className="files-list" aria-label="Uploaded files">{documents.map(document=><li key={document.id} className="file-row" data-status={document.status}>
      <Icon name="file" size={16}/>
      <div className="file-details">
        {document.status==='READY'?<a href={`/api/documents/${document.id}/file`} target="_blank" rel="noopener noreferrer" className="file-title">{document.title}</a>:<span className="file-title">{document.title}</span>}
        <small className="file-status">{document.status==='PROCESSING'&&<span className="research-spinner" aria-hidden="true"/>}{statusText(document)}</small>
      </div>
      {confirming===document.id?<span className="file-confirm">
        <button type="button" className="research-button danger" onClick={()=>void confirmRemove(document.id)}>Delete</button>
        <button type="button" className="research-button" onClick={()=>setConfirming(null)}>Cancel</button>
      </span>:<button type="button" className="research-icon-button" aria-label={`Delete ${document.title}`} onClick={()=>setConfirming(document.id)}><Icon name="trash" size={15}/></button>}
    </li>)}</ul>}
    {full&&<p className="research-muted">You’ve reached the {limits?.maxDocuments}-file limit. Delete a file to upload another.</p>}
  </dialog>;
}
