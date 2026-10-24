import {and,eq,inArray,isNotNull,lt,ne,notInArray,sql} from 'drizzle-orm';
import {ACTIVE_RUN_STATUSES,runs,runRetrievals,sourcePassages,inputSafetyReviews,outputReviews,runPlans} from '@/db/schema';
import type {AdmissionDatabase} from '@/server/runs/usage';
// Retain the approved answer and its URL metadata until owner deletion. Excerpts
// expire at the retrieval snapshot's TTL; non-content safety logs expire in 30 days.
export async function cleanExpiredContent(db:AdmissionDatabase,deadline=performance.now()+5000) {
 if(performance.now()>=deadline)return {passages:0,safety:0,plans:0};
 return db.transaction(async tx=>{
  await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
  await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
  const terminal=tx.select({id:runs.id}).from(runs).where(notInArray(runs.status,[...ACTIVE_RUN_STATUSES]));
  const expired=await tx.select({id:sourcePassages.id}).from(sourcePassages).innerJoin(runRetrievals,eq(sourcePassages.runId,runRetrievals.runId))
   .where(and(lt(runRetrievals.expiresAt,sql`clock_timestamp()`),inArray(sourcePassages.runId,terminal))).limit(100);
  const passages=expired.length?(await tx.delete(sourcePassages).where(inArray(sourcePassages.id,expired.map(x=>x.id))).returning({id:sourcePassages.id})).length:0;
  const cutoff=sql`clock_timestamp() - interval '30 days'`;
  const inputs=await tx.select({id:inputSafetyReviews.runId}).from(inputSafetyReviews).where(and(lt(inputSafetyReviews.createdAt,cutoff),inArray(inputSafetyReviews.runId,terminal))).limit(100);
  if(inputs.length)await tx.delete(inputSafetyReviews).where(inArray(inputSafetyReviews.runId,inputs.map(x=>x.id)));
  const outputs=await tx.select({id:outputReviews.runId}).from(outputReviews).where(and(lt(outputReviews.createdAt,cutoff),ne(outputReviews.decision,'ALLOW'),inArray(outputReviews.runId,terminal))).limit(100);
  if(outputs.length)await tx.delete(outputReviews).where(inArray(outputReviews.runId,outputs.map(x=>x.id)));
  const plans=await tx.select({id:runPlans.runId}).from(runPlans).where(and(lt(runPlans.createdAt,cutoff),isNotNull(runPlans.createdAt),inArray(runPlans.runId,terminal))).limit(100);
  if(plans.length)await tx.delete(runPlans).where(inArray(runPlans.runId,plans.map(x=>x.id)));
  return {passages,safety:inputs.length+outputs.length,plans:plans.length};
 });
}
