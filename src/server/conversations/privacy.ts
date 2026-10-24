import {and,eq,inArray,sql} from 'drizzle-orm';
import {ACTIVE_RUN_STATUSES,appUsers,conversations,messages,runs,runRetrievals,runPlans,inputSafetyReviews,outputReviews} from '@/db/schema';
import type {AdmissionDatabase} from '@/server/runs/usage';
import {settleFailureLocked} from '@/server/runs/finalize';
import {ConversationError} from './errors';

export function createConversationPrivacy(db:AdmissionDatabase) {
 return {
  async remove(subject:string,id:string) {
   return db.transaction(async tx=>{
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    const [owner]=await tx.select({id:appUsers.id}).from(appUsers).where(eq(appUsers.authSubject,subject));
    if(!owner)throw new ConversationError('NOT_FOUND');
    // Same lock order as admission/finalization. Late provider receipts remain writable,
    // but the incremented attempt and revision fence all further content writes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'run-admission:'+owner.id}::text,0))`);
    const [conversation]=await tx.select().from(conversations).where(and(eq(conversations.id,id),eq(conversations.userId,owner.id))).for('update');
    if(!conversation)throw new ConversationError('NOT_FOUND');
    if(conversation.deletedAt)return;
    const [{now}]=await tx.select({now:sql<string>`clock_timestamp()::text`.mapWith(v=>new Date(v))}).from(conversations).where(eq(conversations.id,id));
    const active=await tx.select().from(runs).where(and(eq(runs.conversationId,id),inArray(runs.status,[...ACTIVE_RUN_STATUSES]))).orderBy(runs.id).for('update');
    for(const run of active)await settleFailureLocked(tx,run,now,'PROVIDER_UNAVAILABLE',true);
    await tx.update(conversations).set({deletedAt:now,title:'Deleted conversation',creationFingerprint:'deleted',revision:conversation.revision+1,updatedAt:now}).where(eq(conversations.id,id));
    // Tombstone and financial snapshots contain no question, draft, URL or excerpt.
    // Keep them for idempotency and later reconciliation of unknown provider costs.
    await tx.delete(messages).where(eq(messages.conversationId,id));
    await tx.delete(runPlans).where(eq(runPlans.conversationId,id));
    await tx.delete(inputSafetyReviews).where(eq(inputSafetyReviews.conversationId,id));
    await tx.delete(outputReviews).where(eq(outputReviews.conversationId,id));
    await tx.delete(runRetrievals).where(inArray(runRetrievals.runId,tx.select({id:runs.id}).from(runs).where(eq(runs.conversationId,id))));
   });
  },
 };
}
