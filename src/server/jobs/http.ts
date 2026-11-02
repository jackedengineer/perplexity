import {SAFETY_RESPONSES} from '@/server/safety/responses';
import {JobError,jobId,jobCursor,jobSubmission} from './contracts';
import {requireEmptyBody} from '@/server/runs/recovery-http';
import {AdmissionError} from '@/server/runs/errors';
type Backend={list:(subject:string)=>Promise<unknown>;admit:(subject:string,body:unknown)=>Promise<string>;read:(subject:string,id:string)=>Promise<unknown>;events:(subject:string,id:string,cursor:number)=>Promise<unknown>;cancel:(subject:string,id:string)=>Promise<void>;remove?:(subject:string,id:string)=>Promise<void>};
type Dependencies={enabled:()=>boolean;admissionsEnabled?:()=>boolean;subject:()=>Promise<string|null>;origin:()=>string;consume:(subject:string)=>Promise<void>;backend:()=>Backend};
export const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function readBoundedBytes(request:Request,max=2048){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new JobError('INVALID_INPUT');
 const reader=request.body?.getReader();if(!reader)throw new JobError('INVALID_INPUT');
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(3000)]),chunks:Uint8Array[]=[];let bytes=0;
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{
  for(let count=0;count<256;count++){
   if(signal.aborted)throw new JobError('INVALID_INPUT');const next=await reader.read();if(signal.aborted)throw new JobError('INVALID_INPUT');
   if(next.done)return Buffer.concat(chunks);
   bytes+=next.value.byteLength;if(bytes>max)throw new AdmissionError('TOO_LARGE');chunks.push(next.value);
  }
  throw new JobError('INVALID_INPUT');
 }finally{signal.removeEventListener('abort',cancel);cancel();reader.releaseLock();}
}
export async function readBoundedBody(request:Request,max=2048){return new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedBytes(request,max));}
export function sameOrigin(request:Request,origin:string){
 if(request.method!=='POST'||request.headers.get('origin')!==new URL(origin).origin||new URL(request.url).search)throw new AdmissionError('INVALID_ORIGIN');
}
export function jobFailure(error:unknown){
 const code=error instanceof JobError?error.code:error instanceof AdmissionError?error.code:'UNAVAILABLE';
 const statuses:Record<string,number>={DISABLED:404,NOT_FOUND:404,PAYMENT_REQUIRED:402,CONFLICT:409,QUOTA:429,STALE:409,INVALID_INPUT:400,INPUT_BLOCKED:400,REDACT_SECRET:400,UNAUTHENTICATED:401,INVALID_ORIGIN:403,RATE_LIMITED:429,TOO_LARGE:413};
 const messages:Record<string,string>={INPUT_BLOCKED:SAFETY_RESPONSES.HARMFUL_ASSISTANCE.text,REDACT_SECRET:SAFETY_RESPONSES.REDACT_SECRET.text,PAYMENT_REQUIRED:'A verified Pro test subscription is required.',QUOTA:'Your job allowance is used up.',CONFLICT:'Work is already in progress. Open it to continue.',UNAVAILABLE:'This service is temporarily unavailable. Please try again.'};
 return Response.json({error:{code,message:messages[code]??'This request could not be completed.'}},{status:statuses[code]??503,headers:privateHeaders});
}
export function createJobsHttp(d:Dependencies){
 async function context(){
  if(!d.enabled())throw new JobError('DISABLED');const subject=await d.subject();if(!subject)throw new AdmissionError('UNAUTHENTICATED');
  await d.consume(subject);return {subject,backend:d.backend()};
 }
 async function respond(work:()=>Promise<Response>){try{return await work();}catch(error){return jobFailure(error);}}
 return {
  list:(request:Request)=>respond(async()=>{const {subject,backend}=await context();if(request.method!=='GET'||new URL(request.url).search)throw new JobError('INVALID_INPUT');return Response.json({jobs:await backend.list(subject)},{headers:privateHeaders});}),
  submit:(request:Request)=>respond(async()=>{const {subject,backend}=await context();sameOrigin(request,d.origin());if(d.admissionsEnabled&&!d.admissionsEnabled())throw new JobError('DISABLED');let raw:unknown;try{raw=JSON.parse(await readBoundedBody(request,8192));}catch(error){if(error instanceof AdmissionError)throw error;throw new JobError('INVALID_INPUT');}
   const parsed=jobSubmission.safeParse(raw);if(!parsed.success)throw new JobError('INVALID_INPUT');
   return Response.json({id:await backend.admit(subject,parsed.data)},{status:202,headers:privateHeaders});}),
  read:(request:Request,id:string)=>respond(async()=>{const {subject,backend}=await context();const url=new URL(request.url),cursor=jobCursor.safeParse(url.searchParams.get('after')??'0');
   if(request.method!=='GET'||!jobId.safeParse(id).success||!cursor.success||[...url.searchParams.keys()].some(k=>k!=='after'))throw new JobError('INVALID_INPUT');
   const job=await backend.read(subject,id),events=await backend.events(subject,id,cursor.data);return Response.json({job,events},{headers:privateHeaders});}),
  cancel:(request:Request,id:string)=>respond(async()=>{const {subject,backend}=await context();sameOrigin(request,d.origin());if(!jobId.safeParse(id).success)throw new JobError('INVALID_INPUT');await requireEmptyBody(request);
   await backend.cancel(subject,id);return Response.json({job:await backend.read(subject,id)},{headers:privateHeaders});}),
  remove:(request:Request,id:string)=>respond(async()=>{const {subject,backend}=await context();sameOrigin(request,d.origin());if(!jobId.safeParse(id).success)throw new JobError('INVALID_INPUT');await requireEmptyBody(request);
   if(!backend.remove)throw new JobError('DISABLED');await backend.remove(subject,id);return Response.json({removed:true},{headers:privateHeaders});}),
 };
}
