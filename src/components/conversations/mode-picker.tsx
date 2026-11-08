'use client';
import {useModelAccess} from './model-access';
export type ConversationMode='CHAT'|'FAST'|'DOCUMENTS'|'DEEP';
export function ModePicker({disabled=false}:{disabled?:boolean}) {
 const {mode,setMode,data}=useModelAccess();
 const options=([['CHAT','Chat'],['FAST','Web'],['DOCUMENTS','Files'],['DEEP','Deep Research']] as const).filter(([key])=>key!=='DOCUMENTS'||data?.documents);
 return <div className="mode-picker" role="group" aria-label="Conversation mode">
  {options.map(([key,label])=><button key={key} type="button" aria-pressed={mode===key} disabled={disabled} onClick={()=>setMode(key)}>{label}{key==='DEEP'&&<small>Pro</small>}</button>)}
 </div>;
}
