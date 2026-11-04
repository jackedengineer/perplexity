import {and,eq,gte,lt,sql} from 'drizzle-orm';
import {ACTIVE_RUN_STATUSES,runs,runSettlements} from '@/db/schema';
import type {AdmissionTransaction} from '@/server/runs/usage';
import {freeWindows} from './periods';

export const DAILY_ANSWER_LIMIT=10;
// Includes transferred guest runs; sign-in does not reset the daily allowance.
export async function readDailyAnswers(tx:AdmissionTransaction,principal:string,now:Date) {
 const {day}=freeWindows(now);
 const [{used,reserved}]=await tx.select({
  used:sql<number>`count(*) FILTER (WHERE ${runSettlements.creditsCharged}>0)::integer`,
  reserved:sql<number>`count(*) FILTER (WHERE ${runs.status} IN (${sql.join(ACTIVE_RUN_STATUSES.map(s=>sql`${s}`),sql`, `)}))::integer`,
 }).from(runs).leftJoin(runSettlements,eq(runSettlements.runId,runs.id))
  .where(and(eq(runs.userId,principal),gte(runs.createdAt,day.startsAt),lt(runs.createdAt,day.endsAt)));
 return {limit:DAILY_ANSWER_LIMIT,used,reserved,remaining:Math.max(0,DAILY_ANSWER_LIMIT-used-reserved),resetsAt:day.endsAt.toISOString()};
}
