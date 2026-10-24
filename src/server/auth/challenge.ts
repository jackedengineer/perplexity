import {z} from 'zod';
import {AdmissionError} from '@/server/runs/errors';
export function requiresGuestChallenge(origin:string) {
 return !['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname);
}
export async function verifyGuestChallenge(token:string|null,env:Record<string,string|undefined>,signal:AbortSignal,request:typeof fetch=fetch) {
 const origin=new URL(env.BETTER_AUTH_URL??'https://invalid');
 if(!requiresGuestChallenge(origin.href)&&!env.TURNSTILE_SECRET_KEY)return;
 if(!env.TURNSTILE_SECRET_KEY||!token||token.length>2048)throw new AdmissionError('CONFIGURATION_UNAVAILABLE');
 const response=await request('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token}),
  signal:AbortSignal.any([signal,AbortSignal.timeout(5000)]),redirect:'error',credentials:'omit',cache:'no-store',
 });
 if(!response.ok)throw new AdmissionError('CONFIGURATION_UNAVAILABLE');
 const reader=response.body?.getReader();if(!reader)throw new AdmissionError('CONFIGURATION_UNAVAILABLE');
 let bytes=0,text='';const decoder=new TextDecoder();
 try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>8192)throw new Error('Challenge response exceeds limit');text+=decoder.decode(next.value,{stream:true});}text+=decoder.decode();}
 finally{void reader.cancel().catch(()=>undefined);reader.releaseLock();}
 const result=z.object({success:z.literal(true),hostname:z.literal(origin.hostname),action:z.literal('guest_trial')}).safeParse(JSON.parse(text));
 if(!result.success)throw new AdmissionError('UNAUTHENTICATED');
}
