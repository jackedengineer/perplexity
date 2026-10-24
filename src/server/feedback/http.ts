import {ZodError} from 'zod';
import type {ChatIdentity} from '@/server/chat/delivery';
import {AdmissionError} from '@/server/runs/errors';
import {createPublicError} from '@/server/contracts/errors';
import type {createFeedbackRepository} from './repository';
async function read(request:Request){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new AdmissionError('UNSUPPORTED_MEDIA_TYPE');
 if(Number(request.headers.get('content-length'))>512)throw new AdmissionError('TOO_LARGE');
 const reader=request.body?.getReader();if(!reader)throw new AdmissionError('MALFORMED_JSON');
 let expired=false,size=0;const chunks:Uint8Array[]=[];
 const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{});},3000);
 try{
  while(true){const {done,value}=await reader.read();if(expired)throw new AdmissionError('REQUEST_TIMEOUT');if(done)break;size+=value.length;if(size>512){void reader.cancel().catch(()=>{});throw new AdmissionError('TOO_LARGE');}chunks.push(value);}
  const bytes=Buffer.concat(chunks);try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AdmissionError('MALFORMED_JSON');}
 }finally{clearTimeout(timer);reader.releaseLock();}
}
export function createFeedbackHttp(deps:{identity:()=>Promise<ChatIdentity|null>;repository:()=>ReturnType<typeof createFeedbackRepository>;origin:()=>string;consume:(subject:string)=>Promise<void>;log:(event:{event:string;requestId:string;status:number;durationMs:number})=>void}){
 return {async handle(request:Request,messageId:string){
  const requestId=crypto.randomUUID(),started=performance.now();let response:Response;
  try{
   if(request.method==='PUT'&&request.headers.get('origin')!==new URL(deps.origin()).origin)throw new AdmissionError('INVALID_ORIGIN');
   const identity=await deps.identity();if(!identity)throw new AdmissionError('UNAUTHENTICATED');
   if(request.method==='PUT')await deps.consume(identity.user.id);
   const repo=deps.repository();response=Response.json(request.method==='PUT'?await repo.put(identity,messageId,await read(request)):await repo.get(identity,messageId));
  }catch(error){const problem=createPublicError(error instanceof AdmissionError?error.code:error instanceof ZodError?'INVALID_INPUT':'PROVIDER_UNAVAILABLE',requestId);response=Response.json(problem.body,{status:problem.status});}
  response.headers.set('Cache-Control','private, no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('X-Request-Id',requestId);response.headers.set('Server-Timing',`feedback;dur=${Math.round(performance.now()-started)}`);
  try{deps.log({event:'feedback.request',requestId,status:response.status,durationMs:Math.round(performance.now()-started)});}catch{}
  return response;
 }};
}
