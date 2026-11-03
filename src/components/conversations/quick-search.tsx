'use client';
import Link from 'next/link';
import * as z from 'zod/mini';
import {useEffect,useRef,useState} from 'react';
import {conversationView,type Conversation} from '@/server/conversations/views';
import {Icon} from './icons';

export function QuickSearch({initial,onClose}:{initial:Conversation[];onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),[query,setQuery]=useState('');
 const [result,setResult]=useState<{query:string;items:Conversation[]}|null>(null),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{
  const q=query.trim();if(!q)return;
  const abort=new AbortController();
  const timer=setTimeout(()=>{void (async()=>{
   try{
    const response=await fetch(`/api/conversations?q=${encodeURIComponent(q)}&limit=20`,{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)])});
    if(!response.ok)throw Error();const body=await response.json();
    const items=z.array(conversationView).parse(body.items);
    if(!abort.signal.aborted){setResult({query:q,items});setError('');}
   }catch{if(!abort.signal.aborted)setError('Search is unavailable. Try again or open your library.');}
  })();},180);
  return()=>{clearTimeout(timer);abort.abort();};
 },[query]);
 const items=query.trim()?result?.query===query.trim()?result.items:[]:initial;
 const waiting=Boolean(query.trim()&&result?.query!==query.trim()&&!error);
 return <dialog ref={dialog} className="quick-search" aria-label="Search chats" onClose={onClose} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
  <div className="quick-search-input"><Icon name="search" size={18}/><input aria-label="Search chat titles" placeholder="Search chat titles…" maxLength={160} value={query} onChange={e=>{setQuery(e.target.value);setError('');}}/>
   <button className="research-icon-button" onClick={()=>dialog.current?.close()} aria-label="Close search"><Icon name="close" size={16}/></button></div>
  <div className="quick-search-results" aria-busy={waiting}>
   {error?<p role="alert">{error}</p>:waiting?<p role="status">Searching…</p>:!items.length?<p>No chats found.</p>:items.map(item=><Link key={item.id} href={`/search/${item.id}`} prefetch={false} onClick={()=>dialog.current?.close()}><Icon name={item.pinnedAt?'pin':'clock'} size={16}/><span>{item.title}</span></Link>)}
  </div>
  <footer><span>Private to your account</span><Link href={`/library?q=${encodeURIComponent(query.trim())}`} onClick={()=>dialog.current?.close()}>Open library ↗</Link></footer>
 </dialog>;
}
