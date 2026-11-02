import {and,eq,sql} from 'drizzle-orm';
import {maintenanceStatus} from '@/db/schema';
import type {JobDatabase} from './store';
// Called by the executing task, never by an HTTP delivery acknowledgement.
export async function recordJobMaintenance<T>(db:JobDatabase,budgetKey:string,work:()=>Promise<T>){
 const name='paid-worker:'+budgetKey,startedAt=new Date();
 const claimed=await db.insert(maintenanceStatus).values({name,startedAt,outcome:'RUNNING',completedAt:null})
  .onConflictDoUpdate({target:maintenanceStatus.name,set:{startedAt,outcome:'RUNNING',completedAt:null},
   setWhere:sql`${maintenanceStatus.outcome}<>'RUNNING' OR ${maintenanceStatus.startedAt}<clock_timestamp()-interval '2 minutes'`}).returning({name:maintenanceStatus.name});
 if(!claimed.length)throw new Error('Job maintenance already running');
 const fence=and(eq(maintenanceStatus.name,name),eq(maintenanceStatus.startedAt,startedAt));
 try{
  const result=await work();
  const saved=await db.update(maintenanceStatus).set({outcome:'COMPLETED',completedAt:new Date()}).where(fence).returning({name:maintenanceStatus.name});
  if(!saved.length)throw new Error('Job maintenance lease superseded');
  return result;
 }catch(error){await db.update(maintenanceStatus).set({outcome:'FAILED',completedAt:null}).where(fence);throw error;}
}
