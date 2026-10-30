import {eq,and,sql} from 'drizzle-orm';
import {maintenanceStatus} from '@/db/schema';
import type {AdmissionDatabase} from '@/server/runs/usage';
export async function recordMaintenance<T>(db:AdmissionDatabase,work:()=>Promise<T>,name='recovery') {
 const startedAt=new Date();
 const claimed=await db.insert(maintenanceStatus).values({name:'recovery',startedAt,outcome:'RUNNING',completedAt:null})
  .onConflictDoUpdate({target:maintenanceStatus.name,set:{startedAt,outcome:'RUNNING',completedAt:null},
   setWhere:sql`${maintenanceStatus.outcome} <> 'RUNNING' OR ${maintenanceStatus.startedAt} < clock_timestamp()-interval '2 minutes'`}).returning({name:maintenanceStatus.name});
 if(!claimed.length)throw new Error('Maintenance already running');
 const fence=and(eq(maintenanceStatus.name,'recovery'),eq(maintenanceStatus.startedAt,startedAt));
 const recordScheduled=async(outcome:string)=>{
  if(name!=='scheduled-recovery')return;
  const completedAt=outcome==='COMPLETED'?new Date():null;
  await db.insert(maintenanceStatus).values({name,startedAt,outcome,completedAt}).onConflictDoUpdate({target:maintenanceStatus.name,set:{startedAt,outcome,completedAt},setWhere:sql`${maintenanceStatus.startedAt} <= ${startedAt}`});
 };
 try {
  const result=await work();
  const completed=await db.update(maintenanceStatus).set({outcome:'COMPLETED',completedAt:new Date()}).where(fence).returning({name:maintenanceStatus.name});
  if(!completed.length)throw new Error('Maintenance lease superseded');
  await recordScheduled('COMPLETED');return result;
 }catch(error){
  const failed=await db.update(maintenanceStatus).set({outcome:'FAILED',completedAt:null}).where(fence).returning({name:maintenanceStatus.name});
  if(failed.length)await recordScheduled('FAILED');
  throw error;
 }
}
