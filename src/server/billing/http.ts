import 'server-only';
import {getDb} from '@/db';
import {getCurrentSession} from '@/lib/current-session';
import {readUsage} from './usage';
import {MODEL_CATALOG,catalogConfiguration} from '@/server/ai/catalog';
import {researchAvailable} from '@/server/runs/availability';
import {parseAdmissionPolicyEnvironment} from '@/server/runs/env';
export async function usageResponse(models=false) {
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 try {
  const session=await getCurrentSession();if(!session)return Response.json({error:'Sign in to continue.'},{status:401,headers});
  const usage=await readUsage(getDb(),session.user.id);
  const entries=MODEL_CATALOG.filter(m=>(usage.tier!=='GUEST'||m.band==='ECONOMY')&&catalogConfiguration(m.key,process.env)).map(({key,name,credits,band})=>({key,name,credits,band}));
  const available=models?await researchAvailable(getDb(),parseAdmissionPolicyEnvironment(process.env).operatorBudgetKey):true;
  return Response.json(models?{models:available?entries:[],usage,researchAvailable:available}:usage,{headers});
 }catch{return Response.json({error:'Usage is temporarily unavailable. Please try again.'},{status:503,headers});}
}
