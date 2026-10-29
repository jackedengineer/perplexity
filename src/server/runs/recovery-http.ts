import { createHash,timingSafeEqual } from 'node:crypto';
import type { ChatIdentity } from '@/server/chat/delivery';
import { createPublicError } from '@/server/contracts/errors';
import { AdmissionError } from './errors';
type Dependencies={identity:(request:Request)=>Promise<ChatIdentity|null>;origin:()=>string;secret:()=>string|undefined;
  cancel:(identity:ChatIdentity,id:string)=>Promise<void>;load:(identity:ChatIdentity,id:string)=>Promise<unknown>;
  sweep:(scheduled:boolean)=>Promise<unknown>;log:(event:Record<string,unknown>)=>void};
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function failure(error:unknown,id:string){const problem=createPublicError(error instanceof AdmissionError?error.code:'CONFIGURATION_UNAVAILABLE',id);return Response.json(problem.body,{status:problem.status,headers});}
export function createRecoveryHttp(dependencies:Dependencies) {
 return {
  async cancel(request:Request,id:string) {
   const requestId=crypto.randomUUID();
   try {
    const identity=await dependencies.identity(request);if(!identity)throw new AdmissionError('UNAUTHENTICATED');
    if(request.method!=='POST'||request.headers.get('origin')!==new URL(dependencies.origin()).origin)throw new AdmissionError('INVALID_ORIGIN');
    if(new URL(request.url).search)throw new AdmissionError('INVALID_INPUT');
    await requireEmptyBody(request);
    await dependencies.cancel(identity,id);
    return Response.json(await dependencies.load(identity,id),{headers:{...headers,'X-Request-Id':requestId}});
   }catch(error){return failure(error,requestId);}
  },
  async cron(request:Request) {
   const requestId=crypto.randomUUID(),started=performance.now();
   try {
    const secret=dependencies.secret();if(!secret||!/^[A-Za-z0-9_-]{32,256}$/u.test(secret))throw new AdmissionError('CONFIGURATION_UNAVAILABLE');
    const supplied=request.headers.get('authorization')??'';
    if(supplied.length>512||!timingSafeEqual(createHash('sha256').update(supplied).digest(),createHash('sha256').update('Bearer '+secret).digest()))throw new AdmissionError('UNAUTHENTICATED');
    if(request.method!=='GET'||request.body!==null||new URL(request.url).search)throw new AdmissionError('INVALID_INPUT');
    const result=await dependencies.sweep(request.headers.get('user-agent')==='vercel-cron/1.0');
    dependencies.log({event:'runs.recovery',requestId,outcome:'COMPLETED',durationMs:Math.round(performance.now()-started)});
    return Response.json(result,{headers:{...headers,'X-Request-Id':requestId}});
   }catch(error){dependencies.log({event:'runs.recovery',requestId,outcome:error instanceof AdmissionError?error.code:'UNAVAILABLE',durationMs:Math.round(performance.now()-started)});return failure(error,requestId);}
  },
 };
}

export async function requireEmptyBody(request:Request) {
 if(!request.body)return;
 const reader=request.body.getReader(),signal=AbortSignal.any([request.signal,AbortSignal.timeout(2000)]);
 const cancel=()=>{void reader.cancel().catch(()=>undefined);};signal.addEventListener('abort',cancel,{once:true});
 try {
  if(signal.aborted)throw new AdmissionError('REQUEST_TIMEOUT');
  for(let chunks=0;chunks<16;chunks++) {
   const next=await reader.read();if(signal.aborted)throw new AdmissionError('REQUEST_TIMEOUT');
   if(next.done)return;if(next.value.byteLength>0)throw new AdmissionError('INVALID_INPUT');
  }
  throw new AdmissionError('INVALID_INPUT');
 }finally{signal.removeEventListener('abort',cancel);cancel();reader.releaseLock();}
}
