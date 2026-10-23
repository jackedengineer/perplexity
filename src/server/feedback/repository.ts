import {and,eq,inArray,isNotNull,sql} from 'drizzle-orm';
import {z} from 'zod';
import {appUsers,conversations,messages,outputReviews,runs,messageFeedback,session} from '@/db/schema';
import type {AdmissionDatabase,AdmissionTransaction} from '@/server/runs/usage';
import {AdmissionError} from '@/server/runs/errors';
import type {ChatIdentity} from '@/server/chat/delivery';
import {serializeApprovedPayload} from '@/server/ai/approved-payload';
import {SAFETY_POLICY} from '@/server/safety/policy';
import {feedbackInput} from './contracts';
import {feedbackView} from './view';
const view=(row:{rating:unknown;reason:unknown;version:unknown})=>feedbackView.parse({rating:row.rating,reason:row.reason,version:row.version});
const empty={rating:null,reason:null,version:0};
export function createFeedbackRepository(db:AdmissionDatabase){
 async function target(tx:AdmissionTransaction,identity:ChatIdentity,messageId:string){
  if(!z.uuid().safeParse(messageId).success)throw new AdmissionError('NOT_FOUND');
  const [row]=await tx.select({userId:appUsers.id,conversationId:conversations.id,runId:runs.id,payload:outputReviews.payload,payloadHash:outputReviews.payloadHash,bodyHash:outputReviews.bodyHash,parts:messages.parts})
   .from(messages).innerJoin(conversations,eq(conversations.id,messages.conversationId)).innerJoin(appUsers,eq(appUsers.id,conversations.userId))
   .innerJoin(outputReviews,and(eq(outputReviews.messageId,messages.id),eq(outputReviews.conversationId,conversations.id),eq(outputReviews.decision,'ALLOW')))
   .innerJoin(runs,and(eq(runs.id,outputReviews.runId),eq(runs.conversationId,conversations.id),inArray(runs.status,['COMPLETED','NEEDS_CLARIFICATION'])))
   .innerJoin(session,and(eq(session.id,identity.sessionId),eq(session.userId,appUsers.authSubject),sql`${session.expiresAt}>clock_timestamp()`,sql`${session.createdAt}+interval '30 days'>clock_timestamp()`))
   .where(and(eq(messages.id,messageId),eq(messages.role,'ASSISTANT'),isNotNull(messages.approvedAt),eq(outputReviews.policyVersion,SAFETY_POLICY.version),eq(runs.policyVersion,SAFETY_POLICY.version),eq(messages.policyVersion,SAFETY_POLICY.version),eq(appUsers.authSubject,identity.user.id))).for('share',{of:session});
  if(!row)throw new AdmissionError('NOT_FOUND');
  const canonical=serializeApprovedPayload(row.payload);
  if(canonical.payloadHash!==row.payloadHash||canonical.bodyHash!==row.bodyHash||row.parts.length!==1||row.parts[0].text!==canonical.payload.markdown)throw new AdmissionError('NOT_FOUND');
  return row;
 }
 return {
  async get(identity:ChatIdentity,messageId:string){return db.transaction(async tx=>{
   const owner=await target(tx,identity,messageId),[row]=await tx.select().from(messageFeedback).where(and(eq(messageFeedback.userId,owner.userId),eq(messageFeedback.messageId,messageId)));
   return view(row??empty);
  });},
  async put(identity:ChatIdentity,messageId:string,value:unknown){
   const input=feedbackInput.parse(value);
   return db.transaction(async tx=>{
    await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
    const owner=await target(tx,identity,messageId),where=and(eq(messageFeedback.userId,owner.userId),eq(messageFeedback.messageId,messageId));
    let [row]=await tx.select().from(messageFeedback).where(where).for('update');
    if(!row){
     if(input.expectedVersion!==0)throw new AdmissionError('CONFLICT');
     const [created]=await tx.insert(messageFeedback).values({userId:owner.userId,conversationId:owner.conversationId,messageId,runId:owner.runId,rating:input.rating,reason:input.reason}).onConflictDoNothing().returning();
     if(created)return view(created);
     [row]=await tx.select().from(messageFeedback).where(where).for('update');
    }
    if(!row)throw new AdmissionError('CONFLICT');
    if(row.rating===input.rating&&row.reason===input.reason)return view(row);
    if(row.version!==input.expectedVersion)throw new AdmissionError('CONFLICT');
    const [updated]=await tx.update(messageFeedback).set({rating:input.rating,reason:input.reason,version:row.version+1,updatedAt:sql`clock_timestamp()`}).where(where).returning();
    return view(updated);
   });
  },
 };
}
