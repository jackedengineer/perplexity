'use client';
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import * as z from 'zod/mini';
const windowSchema=z.object({limit:z.number(),used:z.number(),reserved:z.number(),remaining:z.number(),resetsAt:z.string()});
const accessSchema=z.object({models:z.array(z.object({key:z.enum(['fast-default','economy-nano','economy-mistral']),name:z.string(),credits:z.number(),band:z.enum(['ECONOMY','STANDARD'])})),
 usage:z.object({tier:z.enum(['GUEST','FREE']),period:windowSchema,day:windowSchema,paymentsEnabled:z.literal(false)})});
type Access=z.infer<typeof accessSchema>;
type ModelKey=Access['models'][number]['key'];
const AccessContext=createContext<{data:Access|null;key:ModelKey;select:(key:ModelKey)=>void;refresh:()=>void;error:string}>({data:null,key:'fast-default',select:()=>{},refresh:()=>{},error:''});
export function ModelAccessProvider({children}:{children:ReactNode}) {
 const [data,setData]=useState<Access|null>(null),[key,select]=useState<ModelKey>('fast-default'),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const pathname=usePathname(),refresh=useCallback(()=>setVersion(v=>v+1),[]);
 useEffect(()=>{const abort=new AbortController();void (async()=>{try{
  const response=await fetch('/api/models',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)])});
  if(!response.ok)throw new Error();const result=accessSchema.parse(await response.json());if(abort.signal.aborted)return;
  setData(result);select(current=>result.models.some(m=>m.key===current)?current:result.models[0]?.key??'fast-default');setError('');
 }catch{if(!abort.signal.aborted)setError('Model and usage information is temporarily unavailable.');}})();return()=>abort.abort();},[pathname,version]);
 return <AccessContext.Provider value={{data,key,select,refresh,error}}>{children}</AccessContext.Provider>;
}
export const useModelAccess=()=>useContext(AccessContext);
export function ModelSelector({disabled}:{disabled:boolean}) {
 const {data,key,select,error}=useModelAccess();
 if(!data)return <span className="toolbar-unavailable" title={error||'Loading available models'}>{error?'Unavailable':'Loading models…'}</span>;
 return <label className="model-selector"><span className="sr-only">Answer model</span><select aria-label="Answer model" value={key} disabled={disabled||!data.models.length} onChange={event=>select(event.target.value as ModelKey)}>
 {!data.models.length&&<option value="fast-default">Research unavailable</option>}
 {data.models.map(model=><option key={model.key} value={model.key}>{model.name} · {model.credits} credits</option>)}
 </select></label>;
}
export function UsageSummary(){const {data,error,refresh}=useModelAccess();
 if(error)return <p className="usage-summary" role="status">{error} <button type="button" className="text-button" onClick={refresh}>Retry</button></p>;
 if(!data)return null;
 return <p className="usage-summary">{data.usage.tier==='GUEST'?'Guest trial':'Free plan'} · {data.usage.period.remaining} credits left{data.usage.period.reserved>0?` · ${data.usage.period.reserved} reserved`:''}. Answers use credits; unsuccessful requests release them. <span title={new Date(data.usage.period.resetsAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}>{data.usage.tier==='GUEST'?'Trial ends':'Resets'} {new Date(data.usage.period.resetsAt).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short'})} (IST).</span></p>;
}
