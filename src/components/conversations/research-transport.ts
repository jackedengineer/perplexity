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
  const transport=new DefaultChatTransport<ResearchMessage>({api:"/api/chat",credentials:"same-origin",
    prepareSendMessagesRequest:()=>{if(!intent)throw new Error("Question missing");return {body:intent};},
    fetch:async(url,options)=>{
      const response=await request(url,options);runId=uuid(response.headers.get("x-run-id"))??runId;
      if(!response.ok){if(response.status===401)onUnauthenticated();const problem=await response.clone().json().catch(()=>null);throw new Error(safeResearchMessage(problem?.error?.message));}return response;
    },
  });return {transport,async cancel(){
    if(!runId)return null;
    const response=await request(`/api/runs/${runId}/cancellation`,{method:"POST",credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(8000)});
    if(response.status===401)onUnauthenticated();
    if(!response.ok)throw new Error("Cancellation could not be confirmed. Check the same request for its saved status.");
    const status=runStateView.parse(await response.json());
    if(status.runId!==runId||intent&&status.conversationId!==intent.conversationId)throw new Error("Saved run mismatch");
    return status;
  },getIntent:()=>intent,setIntent:(value: SubmitQuery)=>{intent=value;},getRunId:()=>runId};
}
