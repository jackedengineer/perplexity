'use client';
import {useCallback,useEffect,useId,useRef,useState,type ClipboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from './icons';
import {useDocuments,type UserDocument} from './documents';
import {FilesDialog,fileSize} from './files-dialog';

// Matches MAX_ATTACHED_DOCUMENTS in the chat contract; the server enforces it.
export const MAX_ATTACHMENTS=5;
type Upload={key:string;name:string};
const isPdf=(file:File)=>file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf');
const hasFiles=(event:DragEvent)=>Boolean(event.dataTransfer?.types.includes('Files'));

// Everything a composer needs to attach files: uploads in flight, problems to show,
// readiness for sending, and page-wide drag-and-drop while it is mounted.
export function useAttachments({attachments,onAttachments,active}:{attachments:string[];onAttachments:(ids:string[])=>void;active:boolean}){
  const {enabled,documents,limits,loaded,error,upload,refresh}=useDocuments();
  const [uploads,setUploads]=useState<Upload[]>([]),[problems,setProblems]=useState<string[]>([]),[dragging,setDragging]=useState(false);
  const current=useRef(attachments);
  useEffect(()=>{current.current=attachments;},[attachments]);
  const usable=enabled&&active;
  // A file deleted from Manage files (or by another tab) drops out of the question.
  useEffect(()=>{
    if(!loaded||error||!attachments.length)return;
    const kept=attachments.filter(id=>documents.some(document=>document.id===id));
    if(kept.length!==attachments.length)queueMicrotask(()=>{current.current=kept;onAttachments(kept);});
  },[loaded,error,documents,attachments,onAttachments]);
  const add=useCallback(async(files:File[])=>{
    if(!files.length)return;
    const found:string[]=[];
    let room=MAX_ATTACHMENTS-current.current.length-uploads.length;
    const accepted:File[]=[];
    for(const file of files){
      // The server enforces every limit; these checks only spare a pointless upload.
      if(!isPdf(file)){found.push(`${file.name} isn’t a PDF.`);continue;}
      if(limits&&file.size>limits.maxBytes){found.push(`${file.name} is larger than ${fileSize(limits.maxBytes)}.`);continue;}
      if(room<=0){found.push(`You can attach up to ${MAX_ATTACHMENTS} files to a question.`);break;}
      room--;accepted.push(file);
    }
    setProblems(found);
    await Promise.all(accepted.map(async file=>{
      const key=crypto.randomUUID();
      setUploads(list=>[...list,{key,name:file.name}]);
      const result=await upload(file);
      setUploads(list=>list.filter(item=>item.key!==key));
      if('error' in result){setProblems(list=>[...list,`${file.name}: ${result.error}`]);return;}
      if(!current.current.includes(result.document.id)){current.current=[...current.current,result.document.id];onAttachments(current.current);}
    }));
  },[limits,upload,uploads.length,onAttachments]);
  const toggle=useCallback((id:string)=>{
    setProblems([]);
    const next=current.current.includes(id)?current.current.filter(item=>item!==id):[...current.current,id].slice(0,MAX_ATTACHMENTS);
    current.current=next;onAttachments(next);
  },[onAttachments]);
  // Dropping a PDF anywhere on the page attaches it, instead of the browser opening the file.
  useEffect(()=>{
    if(!usable)return;
    let depth=0;
    const enter=(event:DragEvent)=>{if(!hasFiles(event))return;depth++;setDragging(true);};
    const leave=(event:DragEvent)=>{if(!hasFiles(event))return;depth=Math.max(0,depth-1);if(!depth)setDragging(false);};
    const over=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';};
    const drop=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();depth=0;setDragging(false);void add(Array.from(event.dataTransfer?.files??[]));};
    window.addEventListener('dragenter',enter);window.addEventListener('dragleave',leave);window.addEventListener('dragover',over);window.addEventListener('drop',drop);
    return()=>{window.removeEventListener('dragenter',enter);window.removeEventListener('dragleave',leave);window.removeEventListener('dragover',over);window.removeEventListener('drop',drop);};
  },[usable,add]);
  const attached=attachments.map(id=>documents.find(document=>document.id===id)??null);
  const preparing=attached.find(document=>document?.status==='PROCESSING');
  const failed=attached.some(document=>document?.status==='FAILED');
  const missing=attached.some(document=>document===null);
  // A failed list load blocks sending attached files; say so and offer a retry instead of "Loading".
  const loadError=usable&&error&&missing?error:null;
  const notice=!usable||!attachments.length&&!uploads.length||loadError?null:uploads.length?`Uploading ${uploads.length===1?uploads[0].name:`${uploads.length} files`}…`
    :failed?'Remove the file that couldn’t be prepared to send.':preparing?`Preparing ${preparing.title}… you can send once it’s ready.`:missing?'Loading your files…':null;
  return {usable,uploads,problems,dragging,add,toggle,clearProblems:()=>setProblems([]),loadError,retry:refresh,
    ready:!usable||!uploads.length&&!failed&&!preparing&&!missing,notice,
    onPaste(event:ClipboardEvent){
      const files=Array.from(event.clipboardData.files);
      if(!usable||!files.some(isPdf))return;
      event.preventDefault();void add(files);
    }};
}
export type Attachments=ReturnType<typeof useAttachments>;

function chipState(document:UserDocument|null){
  if(!document)return {state:'loading',label:'Loading…'};
  if(document.status==='PROCESSING')return {state:'preparing',label:'Preparing…'};
  if(document.status==='FAILED')return {state:'failed',label:document.failure==='UNREADABLE'?'No readable text':'Couldn’t prepare'};
  return {state:'ready',label:`${document.pageCount} ${document.pageCount===1?'page':'pages'}`};
}

// The files attached to the question being written, plus uploads still in flight.
export function AttachmentChips({attachments,files,onRemove,disabled}:{attachments:string[];files:Attachments;onRemove:(id:string)=>void;disabled:boolean}){
  const {documents}=useDocuments();
  if(!files.usable||!attachments.length&&!files.uploads.length)return null;
  return <ul className="attachment-chips" aria-label="Attached files">
    {attachments.map(id=>{
      const document=documents.find(item=>item.id===id)??null,{state,label}=chipState(document),title=document?.title??'File';
      return <li key={id} className="attachment-chip" data-state={state}>
        <span className="attachment-icon" aria-hidden="true">{state==='preparing'||state==='loading'?<span className="research-spinner"/>:<Icon name="file" size={14}/>}</span>
        <span className="attachment-copy"><span className="attachment-name" title={title}>{title}</span><small>{label}</small></span>
        <button type="button" className="attachment-remove" aria-label={`Remove ${title}`} disabled={disabled} onClick={()=>onRemove(id)}><Icon name="close" size={12}/></button>
      </li>;
    })}
    {files.uploads.map(item=><li key={item.key} className="attachment-chip" data-state="uploading">
      <span className="attachment-icon" aria-hidden="true"><span className="research-spinner"/></span>
      <span className="attachment-copy"><span className="attachment-name" title={item.name}>{item.name}</span><small>Uploading…</small></span>
    </li>)}
  </ul>;
}

// Files a saved question was asked with. Each opens the PDF.
export function QuestionFiles({files}:{files:{id:string;title:string}[]}){
  if(!files.length)return null;
  return <ul className="question-files" aria-label="Files used for this question">
    {files.map(file=><li key={file.id}><a href={`/api/documents/${file.id}/file`} target="_blank" rel="noopener noreferrer"><Icon name="file" size={13}/><span>{file.title}</span></a></li>)}
  </ul>;
}

// Paperclip menu: upload new PDFs or pick from the ones already uploaded.
export function AttachButton({attachments,files,disabled}:{attachments:string[];files:Attachments;disabled:boolean}){
  const {documents,limits}=useDocuments();
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
  const [position,setPosition]=useState<{left:number;top:number;above:boolean;maxHeight:number;host:HTMLElement}|null>(null);
  const [manage,setManage]=useState<HTMLElement|null>(null);
  const recent=documents.slice(0,8),full=attachments.length+files.uploads.length>=MAX_ATTACHMENTS;
  const libraryFull=Boolean(limits&&documents.length>=limits.maxDocuments);
  const close=useCallback((focus=true)=>{setPosition(null);if(focus)trigger.current?.focus();},[]);
  function open(){
    files.clearProblems();
    const rect=trigger.current!.getBoundingClientRect(),width=Math.min(300,window.innerWidth-24);
    const above=rect.top>260;
    setPosition({host:trigger.current!.closest<HTMLElement>('.research-shell')??document.body,above,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:above?rect.top-8:rect.bottom+8,maxHeight:Math.min(420,above?rect.top-20:window.innerHeight-rect.bottom-20)});
  }
  useEffect(()=>{
    if(!position)return;
    const frame=requestAnimationFrame(()=>menu.current?.querySelector<HTMLButtonElement>('[role^=menuitem]:not(:disabled)')?.focus());
    const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close(false);};
    const dismiss=()=>close(false);
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);};
  },[position,close]);
  return <>
    <button type="button" ref={trigger} className="attach-trigger research-icon-button" aria-label="Attach files" aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={position?id:undefined} disabled={disabled}
      onClick={()=>position?close():open()} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();open();}}}>
      <Icon name="paperclip" size={17}/>
    </button>
    <input ref={input} className="files-input" type="file" aria-label="Choose PDF files to attach" tabIndex={-1} accept="application/pdf,.pdf" multiple
      onChange={event=>{const chosen=Array.from(event.target.files??[]);event.target.value='';void files.add(chosen);}}/>
    {/* Portalled out of the composer form, so no menu item can submit the question,
        but kept inside the research shell, which provides the theme. */}
    {position&&createPortal(<div ref={menu} id={id} role="menu" aria-label="Attach files" className="attach-menu" data-above={position.above}
      style={{left:position.left,top:position.top,maxHeight:position.maxHeight}}
      onKeyDown={event=>{
        if(event.key==='Escape'){event.preventDefault();close();return;}
        // Back to the paperclip, not past the portalled menu to the end of the page.
        if(event.key==='Tab'){event.preventDefault();close();return;}
        const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role^=menuitem]:not(:disabled)')??[]),index=items.indexOf(document.activeElement as HTMLButtonElement);
        const next=event.key==='ArrowDown'?(index+1)%items.length:event.key==='ArrowUp'?(index-1+items.length)%items.length:event.key==='Home'?0:event.key==='End'?items.length-1:undefined;
        if(next!==undefined){event.preventDefault();items[next]?.focus();}
      }}>
      <button type="button" role="menuitem" className="attach-item" disabled={full||libraryFull} onClick={()=>{close(false);input.current?.click();}}>
        <Icon name="upload" size={16}/><span className="attach-item-copy"><strong>Upload PDFs</strong><small>{libraryFull?`You’ve reached the ${limits?.maxDocuments}-file limit`:<><span className="drop-only">Or drop them anywhere · </span>Up to {limits?fileSize(limits.maxBytes):'10 MB'} each</>}</small></span>
      </button>
      {recent.length>0&&<>
        <div className="attach-heading" role="presentation">Your files</div>
        {recent.map(document=>{const checked=attachments.includes(document.id),unavailable=document.status==='FAILED'||!checked&&full;
          return <button key={document.id} type="button" role="menuitemcheckbox" aria-checked={checked} className="attach-item" disabled={unavailable} onClick={()=>files.toggle(document.id)}>
            <Icon name="file" size={16}/><span className="attach-item-copy"><strong title={document.title}>{document.title}</strong><small>{document.status==='READY'?`${document.pageCount} ${document.pageCount===1?'page':'pages'} · ${fileSize(document.byteSize)}`:document.status==='PROCESSING'?'Preparing…':'Couldn’t prepare'}</small></span>
            <span className="attach-check" aria-hidden="true">{checked&&<Icon name="check" size={14}/>}</span>
          </button>;})}
      </>}
      <div className="attach-separator" role="separator"/>
      <button type="button" role="menuitem" className="attach-item attach-manage" onClick={()=>{const host=position.host;close(false);setManage(host);}}>
        <Icon name="folder" size={16}/><span className="attach-item-copy"><strong>Manage files</strong></span>
      </button>
    </div>,position.host)}
    {manage&&createPortal(<FilesDialog onClose={()=>{setManage(null);trigger.current?.focus();}}/>,manage)}
  </>;
}

// Shown over the composer while files are dragged anywhere on the page.
export function DropHint({files}:{files:Attachments}){
  return files.usable?<div className="composer-drop" aria-hidden="true"><Icon name="upload" size={18}/>Drop PDFs to attach</div>:null;
}
