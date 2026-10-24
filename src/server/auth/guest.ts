import {verifyGuestChallenge} from './challenge';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {eq} from 'drizzle-orm';
import {guestTrials} from '@/db/schema';
import type {AdmissionDatabase} from '@/server/runs/usage';
import {createRequestLimiter} from '@/server/runs/rate-limit';
import {AdmissionError} from '@/server/runs/errors';
export const GUEST_COOKIE='perplex_trial';
export const guestAuthorization=(secret:string)=>createHmac('sha256',secret).update('perplex:guest-admission:v1').digest('hex');
const digest=(secret:string,value:string)=>createHmac('sha256',secret).update('perplex:trial:'+value).digest('hex');
export function trustedGuestAddress(request:Request,env:Record<string,string|undefined>) {
 if(env.VERCEL==='1') {const ip=request.headers.get('x-vercel-forwarded-for')?.trim();if(ip&&isIP(ip))return ip;throw new AdmissionError('CONFIGURATION_UNAVAILABLE');}
 const origin=new URL(env.BETTER_AUTH_URL??'https://invalid');
 if(env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(origin.hostname))return 'local-development';
 throw new AdmissionError('CONFIGURATION_UNAVAILABLE');
}
export async function guestSignIn(request:Request,db:AdmissionDatabase,env:Record<string,string|undefined>,handler:(request:Request)=>Promise<Response>) {
 const headers={'Cache-Control':'private, no-store'};
 try {
  if(env.ENABLE_GUEST_TRIALS!=='true'||!env.BETTER_AUTH_SECRET)throw new AdmissionError('CONFIGURATION_UNAVAILABLE');
  if(request.method!=='POST'||request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL!).origin)throw new AdmissionError('INVALID_ORIGIN');
  const address=trustedGuestAddress(request,env),secret=env.BETTER_AUTH_SECRET;
  const cookie=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(GUEST_COOKIE+'='))?.slice(GUEST_COOKIE.length+1);
  if(cookie){
   const [value,signature]=cookie.split('.');const expected=digest(secret,value??'');
   if(!value||!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw new AdmissionError('UNAUTHENTICATED');
   const [trial]=await db.select().from(guestTrials).where(eq(guestTrials.handleHash,expected));
   if(trial) return Response.json({error:'This browser has already started its trial. Sign in with Google to continue.'},{status:403,headers});
  }
  const policy={userMinute:1,userDay:3,anonymousMinute:10,anonymousDay:100};
  const limiter=createRequestLimiter(db,'guest-creation-v1',policy);
  await limiter.consume(null);await limiter.consume(digest(secret,'address:'+address));
  await verifyGuestChallenge(request.headers.get('x-perplex-bot-token'),env,request.signal);
  const value=randomBytes(32).toString('hex'),signature=digest(secret,value);
  const forwarded=new Headers(request.headers);forwarded.set('x-perplex-guest-validated',guestAuthorization(secret));
  // The anonymous endpoint takes no client fields. Never forward arbitrary user attributes.
  forwarded.set('content-type','application/json');forwarded.delete('content-length');forwarded.delete('x-perplex-bot-token');
  const response=await handler(new Request(request.url,{method:'POST',headers:forwarded,body:'{}',signal:request.signal}));
  if(!response.ok)return response;
  const body=await response.clone().json();
  if(typeof body?.user?.id!=='string'||body.user.isAnonymous!==true)throw new Error('Invalid anonymous response');
  await db.insert(guestTrials).values({handleHash:signature,authSubject:body.user.id,expiresAt:new Date(Date.now()+30*86400000)});
  response.headers.append('Set-Cookie',`${GUEST_COOKIE}=${value}.${signature}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${env.BETTER_AUTH_URL!.startsWith('https:')?'; Secure':''}`);
  return response;
 }catch(error){const code=error instanceof AdmissionError?error.code:'CONFIGURATION_UNAVAILABLE';return Response.json({error:code==='RATE_LIMITED'?'Guest trials are temporarily limited. Please sign in.':'Guest access is unavailable. Please sign in.'},{status:code==='RATE_LIMITED'?429:code==='INVALID_ORIGIN'?403:503,headers});}
}
