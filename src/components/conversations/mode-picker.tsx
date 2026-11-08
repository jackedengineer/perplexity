'use client';
import {useModelAccess} from './model-access';
export type ConversationMode='CHAT'|'FAST'|'DEEP';
export function ModePicker({disabled=false}:{disabled?:boolean}) {
 const {mode,setMode}=useModelAccess();
 // Files aren't a mode: any Chat or Web question can carry attached PDFs.
 const options=[['CHAT','Chat'],['FAST','Web'],['DEEP','Deep Research']] as const;
 return <div className="mode-picker" role="group" aria-label="Conversation mode">
  {options.map(([key,label])=><button key={key} type="button" aria-pressed={mode===key} disabled={disabled} onClick={()=>setMode(key)}>{label}{key==='DEEP'&&<small>Pro</small>}</button>)}
 </div>;
}
