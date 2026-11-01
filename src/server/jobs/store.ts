import {and,eq,sql} from 'drizzle-orm';
import {appUsers,user,durableJobs as jobs,jobEvents as events} from '@/db/schema';
import type {AdmissionDatabase,AdmissionTransaction} from '@/server/runs/usage';
import {JobError,type ProgressCode} from './contracts';
export type JobDatabase=AdmissionDatabase;
export type JobTransaction=AdmissionTransaction;
export async function databaseNow(tx:JobTransaction){
 const [result]=await tx.select({now:sql<string>`clock.now`}).from(sql`(SELECT clock_timestamp() AS now) AS clock`);
 return new Date(result.now);
}
export async function ownerFor(tx:JobTransaction,subject:string){
 const [identity]=await tx.select({id:user.id}).from(user)
  .where(and(eq(user.id,subject),eq(user.isAnonymous,false),eq(user.emailVerified,true))).limit(1);
 if(!identity)throw new JobError('PAYMENT_REQUIRED');
 await tx.insert(appUsers).values({authSubject:subject}).onConflictDoNothing({target:appUsers.authSubject});
 const [owner]=await tx.select({id:appUsers.id}).from(appUsers).where(eq(appUsers.authSubject,subject));
 return owner.id;
}
export async function lockJob(tx:JobTransaction,id:string){
 const [job]=await tx.select().from(jobs).where(eq(jobs.id,id)).for('update');
 if(!job)throw new JobError('NOT_FOUND');return job;
}
// Caller holds job row lock. Allocate and insert under that same transaction.
export async function appendEvent(tx:JobTransaction,id:string,code:ProgressCode,step:string|null=null){
 const [next]=await tx.update(jobs).set({nextEvent:sql`${jobs.nextEvent}+1`,updatedAt:sql`clock_timestamp()`}).where(eq(jobs.id,id)).returning({sequence:jobs.nextEvent});
 await tx.insert(events).values({jobId:id,sequence:next.sequence-1,code,step});
}
