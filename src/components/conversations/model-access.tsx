'use client';
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import type {ConversationMode} from './mode-picker';
import {readFavorites,toggleFavorite} from './model-preferences';
import {ModelPicker} from './model-picker';
import {usePathname} from 'next/navigation';
import {DocumentsProvider,readyDocuments,useDocuments} from './documents';
import * as z from 'zod/mini';
const windowSchema=z.object({limit:z.number(),used:z.number(),reserved:z.number(),remaining:z.number(),resetsAt:z.string()});
const accessSchema=z.object({models:z.array(z.object({key:z.enum(['fast-default','economy-nano','economy-mistral','economy-qwen','economy-gemini','standard-deepseek','standard-gemini-flash','standard-qwen-max','standard-qwen-397b']),name:z.string(),credits:z.number(),band:z.enum(['ECONOMY','STANDARD'])})),
 usage:z.object({answers:z.optional(windowSchema),subscription:z.optional(z.nullable(z.object({plan:z.literal('PRO'),endsAt:z.string(),reportsRemaining:z.number()}))),tier:z.enum(['GUEST','FREE']),period:windowSchema,day:windowSchema,paymentsEnabled:z.literal(false)}),documents:z.optional(z.boolean())});
type Access=z.infer<typeof accessSchema>;
type ModelKey=Access['models'][number]['key'];
const AccessContext=createContext<{data:Access|null;key:ModelKey;select:(key:ModelKey)=>void;refresh:()=>void;error:string;mode:ConversationMode;setMode:(mode:ConversationMode)=>void;deepAvailable:boolean;favorites:string[];favorite:(key:ModelKey)=>void}>({data:null,key:'fast-default',select:()=>{},refresh:()=>{},error:'',mode:'FAST',setMode:()=>{},deepAvailable:false,favorites:[],favorite:()=>{}});
export function ModelAccessProvider({children,preferenceKey="default",deepAvailable=false,enabled=true}:{children:ReactNode;preferenceKey?:string;deepAvailable?:boolean;enabled?:boolean}) {
 const [data,setData]=useState<Access|null>(null),[key,select]=useState<ModelKey>('fast-default'),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const [mode,setMode]=useState<ConversationMode>('FAST');
 const storageKey=`graphite-model-favorites:${preferenceKey}`;
 const [favorites,setFavorites]=useState<string[]>([]);
 useEffect(()=>{queueMicrotask(()=>{try{setFavorites(readFavorites(localStorage,storageKey));}catch{setFavorites([]);}});},[storageKey]);
 const favorite=(key:ModelKey)=>setFavorites(current=>{const next=toggleFavorite(current,key);try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* In-memory fallback for restricted storage. */}return next;});
 const pathname=usePathname(),refresh=useCallback(()=>setVersion(v=>v+1),[]);
 useEffect(()=>{if(!enabled)return;const abort=new AbortController();void (async()=>{try{
  const response=await fetch('/api/models',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)])});
  if(!response.ok)throw new Error();const result=accessSchema.parse(await response.json());if(abort.signal.aborted)return;
  setData(result);select(current=>result.models.some(m=>m.key===current)?current:result.models[0]?.key??'fast-default');setError('');
 }catch{if(!abort.signal.aborted){setData(null);setError('Model and usage information is temporarily unavailable.');}}})();return()=>abort.abort();},[pathname,version,enabled]);
 useEffect(()=>{if(!enabled)return;const onFocus=()=>refresh();window.addEventListener('focus',onFocus);const timer=setInterval(refresh,60000);return()=>{window.removeEventListener('focus',onFocus);clearInterval(timer);};},[refresh,enabled]);
 // Files mode disappears if the feature is switched off or the account is a guest.
 useEffect(()=>{if(mode==='DOCUMENTS'&&data&&!data.documents)queueMicrotask(()=>setMode('FAST'));},[mode,data]);
 return <AccessContext.Provider value={{data,key,select,refresh,error,favorites,favorite,mode,setMode,deepAvailable}}><DocumentsProvider enabled={Boolean(data?.documents)} active={mode==='DOCUMENTS'}>{children}</DocumentsProvider></AccessContext.Provider>;
}
export const useModelAccess=()=>useContext(AccessContext);
export function ModelSelector({disabled}:{disabled:boolean}) {
 const {data,key,select,error,favorites,favorite}=useModelAccess();
 if(!data)return <span className="toolbar-unavailable" title={error||'Loading available models'}>{error?'Unavailable':'Loading models…'}</span>;
 return <ModelPicker models={data.models} value={key} onSelect={select} disabled={disabled} favorites={favorites} onFavorite={favorite}/>;
}
export function UsageSummary(){const {data,error,refresh,key,mode,deepAvailable}=useModelAccess(),files=useDocuments();
 if(error)return <p className="usage-summary" role="status">{error} <button type="button" className="text-button" onClick={refresh}>Retry</button></p>;
 if(!data)return null;
 if(mode==='DEEP')return <p className="usage-summary">{!deepAvailable?'Deep Research is temporarily paused.':data.usage.subscription?`${data.usage.subscription.reportsRemaining} reports remaining · 1 report per completed run`:'Pro · 7 Deep Research reports per month'} · Up to 15 minutes</p>;
 if(!data.models.length)return <p className="usage-summary" role="status">Answers are temporarily paused. Your saved chats are available. <button type="button" className="text-button" onClick={refresh}>Check availability</button></p>;
 const selected=data.models.find(model=>model.key===key);
 if(mode==='DOCUMENTS'&&files.loaded&&!readyDocuments(files.documents))return <p className="usage-summary">{files.documents.some(d=>d.status==='PROCESSING')?'Your files are being prepared. You can ask once one is ready.':'Upload a PDF to ask questions about it.'}</p>;
 return <p className="usage-summary">{selected?.credits??'—'} credits / answer · {Math.min(data.usage.day.remaining,data.usage.period.remaining)} credits left today{data.usage.answers?` · ${data.usage.answers.remaining}/${data.usage.answers.limit} answers left today`:''} · {mode==='CHAT'?'No web search':mode==='DOCUMENTS'?'Answers from your files':'Web sources included'}</p>;
}
