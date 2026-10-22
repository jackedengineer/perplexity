import { DefaultChatTransport } from "ai";
import type { SubmitQuery } from "@/server/contracts/chat";
import { PUBLIC_ERRORS } from "@/server/contracts/error-messages";
import type { ResearchMessage } from "@/server/chat/views";
export const safeResearchMessage=(value: unknown)=>Object.values(PUBLIC_ERRORS).find(([,text])=>text===value)?.[1]??PUBLIC_ERRORS.PROVIDER_UNAVAILABLE[1];
const uuid=(value: string|null)=>value&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(value)?value:null;
export function createResearchTransport(onUnauthenticated: ()=>void,request: typeof fetch = fetch) {
  // Event-driven transport state is deliberately independent of React's render state.
  let intent: SubmitQuery|null=null,runId: string|null=null;
  const transport=new DefaultChatTransport<ResearchMessage>({api:"/api/chat",credentials:"same-origin",
    prepareSendMessagesRequest:()=>{if(!intent)throw new Error("Question missing");return {body:intent};},
    fetch:async(url,options)=>{
      const response=await request(url,options);runId=uuid(response.headers.get("x-run-id"))??runId;
      if(!response.ok){if(response.status===401)onUnauthenticated();const problem=await response.clone().json().catch(()=>null);throw new Error(safeResearchMessage(problem?.error?.message));}return response;
    },
  });return {transport,getIntent:()=>intent,setIntent:(value: SubmitQuery)=>{intent=value;},getRunId:()=>runId};
}
