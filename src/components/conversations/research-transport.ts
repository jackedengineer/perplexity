import { DefaultChatTransport } from "ai";
import type { SubmitQuery } from "@/server/contracts/chat";
import { PUBLIC_ERRORS } from "@/server/contracts/error-messages";
import { runStateView,type ResearchMessage,type RunState } from "@/server/chat/views";
export const safeResearchMessage=(value: unknown)=>Object.values(PUBLIC_ERRORS).find(([,text])=>text===value)?.[1]??PUBLIC_ERRORS.PROVIDER_UNAVAILABLE[1];
export function savedFailureMessage(current:string,reason?:RunState['terminalReason']) {
  if(reason==='CANCELLED')return 'Research stopped. You can start a new search.';
  if(reason==='TIMED_OUT')return 'This research request timed out. You can start a new search.';
  const terminal=['DEADLINE_EXCEEDED','INPUT_BLOCKED','OUTPUT_BLOCKED','SAFETY_UNAVAILABLE','PROVIDER_UNAVAILABLE','BUDGET_EXCEEDED'] as const;
  return terminal.map(code=>PUBLIC_ERRORS[code][1]).find(message=>message===current)??PUBLIC_ERRORS.PROVIDER_UNAVAILABLE[1];
}
const uuid=(value: string|null)=>value&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(value)?value:null;
export function createResearchTransport(onUnauthenticated: ()=>void,request: typeof fetch = fetch,initialRunId:string|null=null) {
  // Event-driven transport state is deliberately independent of React's render state.
  let intent: SubmitQuery|null=null,runId: string|null=uuid(initialRunId);
  let revision:number|null=null;
  let dispatched=false,cancellationRequested=false,pendingHeaders:Promise<void>|null=null;
  const recordRevision=(id:unknown,value:unknown)=>{
    if(id!==runId||!runId||typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>2147483647)return false;
    revision=Math.max(revision??0,value);return true;
  };
  const transport=new DefaultChatTransport<ResearchMessage>({api:"/api/chat",credentials:"same-origin",
    prepareSendMessagesRequest:()=>{if(!intent)throw new Error("Question missing");if(cancellationRequested)throw new Error('Research stopped.');return {body:intent};},
    fetch:async(url,options)=>{
      if(cancellationRequested)throw new Error('Research stopped.');
      dispatched=true;
      let finishHeaders!:()=>void;
      const headersReady=new Promise<void>(resolve=>{finishHeaders=resolve;});pendingHeaders=headersReady;
      try {
      const response=await request(url,options),identified=uuid(response.headers.get("x-run-id"));
      if(identified){if(runId&&identified!==runId)throw new Error('Saved run mismatch');runId=identified;
        const header=response.headers.get('x-run-revision');if(header!==null&&/^\d+$/u.test(header))recordRevision(runId,Number(header));}
      finishHeaders();
      if(!response.ok){if(response.status===401)onUnauthenticated();const problem=await response.clone().json().catch(()=>null);throw new Error(safeResearchMessage(problem?.error?.message));}return response;
      }finally{finishHeaders();if(pendingHeaders===headersReady)pendingHeaders=null;}
    },
  });return {transport,async cancel(){
    cancellationRequested=true;
    // Keep the HTTP request alive until its admitted identity can be cancelled.
    // A disconnect alone does not reliably stop work on hosted runtimes.
    if(!runId&&pendingHeaders){
      const ready=pendingHeaders;
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Cancellation could not be confirmed.')),8000);
        void ready.then(()=>{clearTimeout(timer);resolve();});
      });
    }
    if(!runId){if(dispatched)throw new Error('Cancellation could not be confirmed.');return null;}
    const response=await request(`/api/runs/${runId}/cancellation`,{method:"POST",credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(8000)});
    if(response.status===401)onUnauthenticated();
    if(!response.ok)throw new Error("Cancellation could not be confirmed. Check the same request for its saved status.");
    const status=runStateView.parse(await response.json());
    if(status.runId!==runId||intent&&status.conversationId!==intent.conversationId)throw new Error("Saved run mismatch");
    recordRevision(status.runId,status.revision);
    return status;
  },getIntent:()=>intent,setIntent:(value: SubmitQuery)=>{intent=value;},getRunId:()=>runId,getRevision:()=>revision,recordRevision};
}
