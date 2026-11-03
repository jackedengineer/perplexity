import {MODEL_CATALOG} from '@/server/ai/catalog';
export function GET(request:Request){
 const window={limit:40,used:0,reserved:0,remaining:40,resetsAt:'2027-01-01T00:00:00Z'};
 const pro=new URL(request.headers.get('referer')??request.url).searchParams.get('pro')==='1';
 return Response.json({models:MODEL_CATALOG.map(({key,name,credits,band})=>({key,name,credits,band})),usage:{tier:'FREE',period:window,day:window,paymentsEnabled:false,subscription:pro?{plan:'PRO',endsAt:'2027-01-01T00:00:00Z',reportsRemaining:5}:null}});
}
