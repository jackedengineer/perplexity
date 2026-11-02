import {createHash,timingSafeEqual} from 'node:crypto';
import {privateHeaders} from './http';
export function createScheduledJobHttp(d:{enabled:()=>boolean;secret:()=>string|undefined;kick:()=>Promise<void>}){
 return async(request:Request)=>{
  if(!d.enabled())return new Response(null,{status:404,headers:privateHeaders});
  const secret=d.secret(),supplied=request.headers.get('authorization')??'';
  if(!secret||!/^[A-Za-z0-9_-]{32,256}$/u.test(secret))return new Response(null,{status:503,headers:privateHeaders});
  if(supplied.length>512||!timingSafeEqual(createHash('sha256').update(supplied).digest(),createHash('sha256').update('Bearer '+secret).digest()))return new Response(null,{status:401,headers:privateHeaders});
  if(request.method!=='GET'||request.body!==null||new URL(request.url).search)return new Response(null,{status:400,headers:privateHeaders});
  try{await d.kick();return Response.json({accepted:true},{status:202,headers:privateHeaders});}
  catch{return Response.json({accepted:false},{status:503,headers:privateHeaders});}
 };
}
