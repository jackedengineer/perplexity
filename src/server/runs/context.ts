import {and,desc,eq,lt,or,isNotNull} from 'drizzle-orm';
import {z} from 'zod';
import {messages,outputReviews,runs} from '@/db/schema';
import {serializeApprovedPayload} from '@/server/ai/approved-payload';
import {SAFETY_POLICY} from '@/server/safety/policy';
import type {AdmissionTransaction} from './usage';
const partsSchema=z.tuple([z.strictObject({type:z.literal('text'),text:z.string().min(1).max(4000)})]);
// Newest complete messages only. Never truncate a turn, silently accept an
// invalid proof, or treat an assistant answer as fresh retrieved evidence.
export async function loadPlanningContext(tx:AdmissionTransaction,conversationId:string,before=2147483647,complete=false){
 const rows=await tx.select({id:messages.id,role:messages.role,parts:messages.parts,approvedAt:messages.approvedAt,policy:messages.policyVersion,
  payload:outputReviews.payload,payloadHash:outputReviews.payloadHash,bodyHash:outputReviews.bodyHash,decision:outputReviews.decision,status:runs.status,
 }).from(messages).leftJoin(outputReviews,eq(outputReviews.messageId,messages.id)).leftJoin(runs,eq(runs.id,outputReviews.runId))

 .where(and(eq(messages.conversationId,conversationId),lt(messages.sequence,before),or(eq(messages.role,'USER'),isNotNull(messages.approvedAt)))).orderBy(desc(messages.sequence)).limit(complete?7:6);
 if(complete&&rows.length>6)throw new Error('Complete safety history exceeds limit');
 const context:Array<{id:string;role:'USER'|'ASSISTANT';text:string}>=[];let characters=0;
 for(const row of rows){
  const parts=partsSchema.safeParse(row.parts);
  if(!parts.success||!row.approvedAt||row.policy!==SAFETY_POLICY.version)throw new Error('Invalid context');
  if(row.role==='ASSISTANT'){
   const canonical=serializeApprovedPayload(row.payload);
   if(row.decision!=='ALLOW'||!['COMPLETED','NEEDS_CLARIFICATION'].includes(row.status??'')||canonical.payloadHash!==row.payloadHash||canonical.bodyHash!==row.bodyHash||canonical.payload.markdown!==parts.data[0].text)throw new Error('Invalid context');
  }
  const text=parts.data[0].text;if(characters+text.length>6000){if(complete)throw new Error('Complete safety history exceeds limit');break;}
  characters+=text.length;context.push({id:row.id,role:row.role,text});
 }
 return context.reverse();
}

// Safety cannot silently forget an earlier intent. A bounded planner tail is
// useful for resolution, but not a substitute for complete safety history.
export const loadSafetyContext=(tx:AdmissionTransaction,id:string)=>loadPlanningContext(tx,id,2147483647,true);
