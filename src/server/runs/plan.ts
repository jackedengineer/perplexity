import {createHash} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import {inputSafetyReviews,messages,runPlans,runs} from '@/db/schema';
import {plannerInputSchema,standaloneFallback,validatePlan} from '@/server/ai/plan';
import type {PlannerProvider} from '@/server/ai/planner-provider';
import type {SubmitQuery} from '@/server/contracts/chat';
import {lockOwnedRun} from './lock';
import {loadPlanningContext} from './context';
import type {AdmissionDatabase} from './usage';
import {AdmissionError} from './errors';
export async function planRun(db:AdmissionDatabase,subject:string,runId:string,submission:SubmitQuery,provider:PlannerProvider,signal:AbortSignal){
 const loaded=await db.transaction(async tx=>{
  const {run,conversation,now}=await lockOwnedRun(tx,subject,runId);
  if(run.status!=='PLANNING'||run.attemptVersion!==1||conversation.revision!==run.admittedRevision||run.deadlineAt<=now||signal.aborted)throw new AdmissionError('CONFLICT');
  const [review]=await tx.select().from(inputSafetyReviews).where(and(eq(inputSafetyReviews.runId,runId),eq(inputSafetyReviews.decision,'ALLOW')));
  const [message]=review?.acceptedMessageId?await tx.select().from(messages).where(and(eq(messages.id,review.acceptedMessageId),eq(messages.conversationId,run.conversationId))):[];
  if(!message?.approvedAt||message.role!=='USER'||message.parts.length!==1||message.parts[0].text!==submission.message.text||review.attemptVersion!==run.attemptVersion)throw new AdmissionError('SAFETY_UNAVAILABLE');
  const context=await loadPlanningContext(tx,run.conversationId,message.sequence);
  return {run,input:plannerInputSchema.parse({original:{id:message.id,text:message.parts[0].text},context,now:now.toISOString(),timezone:submission.timezone??'UTC',locale:submission.locale??null})};
 });
 let plan;
 try{plan=validatePlan((await provider.plan(loaded.input,{signal,deadlineAt:loaded.run.deadlineAt})).plan,loaded.input,loaded.run.accountingVersion===2?2:1);}
 catch(error){if(error instanceof AdmissionError)throw error;plan=standaloneFallback(loaded.input);if(!plan)throw new AdmissionError('PROVIDER_UNAVAILABLE');}
 await db.transaction(async tx=>{
  const {run,conversation,now}=await lockOwnedRun(tx,subject,runId);
  if(run.status!=='PLANNING'||run.attemptVersion!==loaded.run.attemptVersion||conversation.revision!==loaded.run.admittedRevision||run.deadlineAt<=now||signal.aborted)throw new AdmissionError('CONFLICT');
  await tx.insert(runPlans).values({runId,conversationId:run.conversationId,messageId:loaded.input.original.id,attemptVersion:run.attemptVersion,version:'planner-v1',plan,contextIds:loaded.input.context.map(m=>m.id),originalHash:createHash('sha256').update(loaded.input.original.text).digest('hex'),createdAt:now});
  if(plan.action==='CLARIFY')await tx.update(runs).set({status:'CHECKING_OUTPUT',updatedAt:now}).where(eq(runs.id,runId));
 });
 return {plan,original:loaded.input.original.text};
}
