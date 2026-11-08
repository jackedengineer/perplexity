'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import * as z from 'zod/mini';

const documentSchema=z.object({id:z.string(),title:z.string(),status:z.enum(['PROCESSING','READY','FAILED']),pageCount:z.number(),byteSize:z.number(),createdAt:z.string(),failure:z.nullable(z.enum(['UNREADABLE','EMBEDDING_FAILED']))});
const listSchema=z.object({data:z.array(documentSchema),limits:z.object({maxDocuments:z.number(),maxBytes:z.number(),maxPages:z.number()})});
const errorSchema=z.object({error:z.object({message:z.string()})});
export type UserDocument=z.infer<typeof documentSchema>;
type Limits=z.infer<typeof listSchema>['limits'];
export type UploadResult={document:UserDocument}|{error:string};
type DocumentsState={enabled:boolean;documents:UserDocument[];limits:Limits|null;loaded:boolean;error:string;refresh:()=>void;
  upload:(file:File)=>Promise<UploadResult>;remove:(id:string)=>Promise<string|null>};
const Documents=createContext<DocumentsState>({enabled:false,documents:[],limits:null,loaded:false,error:'',refresh:()=>{},upload:async()=>({error:'Your files are temporarily unavailable. Please try again.'}),remove:async()=>null});
const FALLBACK_MESSAGE='Your files are temporarily unavailable. Please try again.';
async function failure(response:Response){
  try{return errorSchema.parse(await response.json()).error.message;}catch{return FALLBACK_MESSAGE;}
}

// One list shared by the composer, its attach menu and the files dialog. It loads once
// the feature is available and polls only while a file is still being prepared.
export function DocumentsProvider({enabled,children}:{enabled:boolean;children:ReactNode}){
  const [documents,setDocuments]=useState<UserDocument[]>([]),[limits,setLimits]=useState<Limits|null>(null);
  const [loaded,setLoaded]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0);
  const refresh=useCallback(()=>setVersion(v=>v+1),[]);
  const live=useRef(true);
  useEffect(()=>()=>{live.current=false;},[]);
  useEffect(()=>{
    if(!enabled)return;
    const abort=new AbortController();
    void (async()=>{try{
      const response=await fetch('/api/documents',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)])});
      if(!response.ok)throw new Error(await failure(response));
      const result=listSchema.parse(await response.json());
      if(abort.signal.aborted)return;
      setDocuments(result.data);setLimits(result.limits);setError('');setLoaded(true);
    }catch(problem){if(!abort.signal.aborted){setError(problem instanceof Error&&problem.message?problem.message:FALLBACK_MESSAGE);setLoaded(true);}}})();
    return()=>abort.abort();
  },[enabled,version]);
  const preparing=documents.some(document=>document.status==='PROCESSING');
  useEffect(()=>{
    if(!enabled||!preparing)return;
    const timer=setInterval(refresh,3000);
    return()=>clearInterval(timer);
  },[enabled,preparing,refresh]);
  const upload=useCallback(async(file:File)=>{
    try{
      const response=await fetch('/api/documents',{method:'POST',credentials:'same-origin',body:file,
        headers:{'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name)}});
      if(!response.ok)return {error:await failure(response)};
      const {data}=z.object({data:documentSchema}).parse(await response.json());
      // Shown at once, so its chip has a title before the list refreshes.
      if(live.current)setDocuments(current=>[data,...current.filter(document=>document.id!==data.id)]);
      refresh();return {document:data};
    }catch{return {error:FALLBACK_MESSAGE};}
  },[refresh]);
  const remove=useCallback(async(id:string)=>{
    try{
      const response=await fetch(`/api/documents/${encodeURIComponent(id)}`,{method:'DELETE',credentials:'same-origin'});
      if(!response.ok&&response.status!==404)return await failure(response);
      if(live.current)setDocuments(current=>current.filter(document=>document.id!==id));
      refresh();return null;
    }catch{return FALLBACK_MESSAGE;}
  },[refresh]);
  return <Documents.Provider value={{enabled,documents,limits,loaded,error,refresh,upload,remove}}>{children}</Documents.Provider>;
}
export const useDocuments=()=>useContext(Documents);

