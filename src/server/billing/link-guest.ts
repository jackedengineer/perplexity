import {and,eq,inArray,sql} from 'drizzle-orm';
import {ACTIVE_RUN_STATUSES,appUsers,runs,conversations} from '@/db/schema';
import type {AdmissionDatabase} from '@/server/runs/usage';
import {settleFailureLocked} from '@/server/runs/finalize';
export async function linkGuest(db:AdmissionDatabase,guestSubject:string,targetSubject:string) {
 if(guestSubject===targetSubject)return;
 await db.transaction(async tx=>{
  await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
  await tx.insert(appUsers).values([{authSubject:targetSubject},{authSubject:guestSubject}]).onConflictDoNothing();
  const owners=await tx.select().from(appUsers).where(inArray(appUsers.authSubject,[guestSubject,targetSubject])).orderBy(appUsers.id);
  if(owners.length!==2)return; // A guest who never created a conversation has no private data to move.
  for(const owner of owners)await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'run-admission:'+owner.id}::text,0))`);
  const guest=owners.find(o=>o.authSubject===guestSubject)!;
  const active=await tx.select().from(runs).where(and(eq(runs.userId,guest.id),inArray(runs.status,[...ACTIVE_RUN_STATUSES]))).orderBy(runs.conversationId);
  for(const run of active){
   await tx.select({id:conversations.id}).from(conversations).where(eq(conversations.id,run.conversationId)).for('update');
   await tx.select({id:runs.id}).from(runs).where(eq(runs.id,run.id)).for('update');
   const [{now}]=await tx.select({now:sql<string>`clock_timestamp()::text`.mapWith(v=>new Date(v))}).from(runs).where(eq(runs.id,run.id));
   await settleFailureLocked(tx,run,now,'PROVIDER_UNAVAILABLE',true);
   await tx.update(conversations).set({revision:sql`${conversations.revision}+1`}).where(eq(conversations.id,run.conversationId));
  }
  await tx.execute(sql`SELECT link_guest_account(${guestSubject},${targetSubject})`);
 });
}
