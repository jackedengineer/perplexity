import {JobError} from './contracts';
export type PaidActivityStore={get:(key:string,options?:{cacheTtl:number})=>Promise<string|null>;put:(key:string,value:string,options:{expirationTtl:number})=>Promise<unknown>};
const activityKey=(key:string)=>{
 if(!/^(?:live|test)-[A-Za-z0-9-]{1,55}$/u.test(key))throw new JobError('UNAVAILABLE');
 return 'paid-activity:'+key;
};
async function boundedActivity<T>(work:()=>Promise<T>){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new JobError('UNAVAILABLE')),1500);})]);}
 catch{throw new JobError('UNAVAILABLE');}finally{clearTimeout(timer);}
}
export async function markPaidActivity(store:PaidActivityStore|undefined,budgetKey:string){
 const key=activityKey(budgetKey);if(!store)throw new JobError('UNAVAILABLE');
 await boundedActivity(async()=>{
  const expires=Number(await store.get(key,{cacheTtl:30}));
  if(Number.isFinite(expires)&&expires>Date.now()+20*60000)return;
  // Metadata only. Never delete on completion: another accepted job or signed
  // billing event may have refreshed this marker concurrently.
  await store.put(key,String(Date.now()+3600000),{expirationTtl:3600});
 });
}
export async function shouldRunPaidTick(store:PaidActivityStore|undefined,budgetKey:string,force:boolean){
 const key=activityKey(budgetKey);if(force||!store)return true;
 try{
  const value=await boundedActivity(()=>store.get(key,{cacheTtl:30}));
  if(value===null)return false;
  const expires=Number(value);return !Number.isFinite(expires)||expires>Date.now();
 }catch{return true;}// Activity is a cost hint, never authority to skip recovery during a KV outage.
}
