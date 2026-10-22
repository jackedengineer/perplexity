import { and,eq,inArray,isNull,lte,or,sql } from 'drizzle-orm';
import { z } from 'zod';
import { ACTIVE_RUN_STATUSES,appUsers,runs,runSettlements,session } from '@/db/schema';
import type { ChatIdentity } from '@/server/chat/delivery';
import type { AdmissionDatabase,AdmissionTransaction } from './usage';
import { lockOwnedRun } from './lock';
import { lockCompletionSession,settleFailureLocked } from './finalize';
import { AdmissionError } from './errors';
const active=(status:typeof runs.$inferSelect['status'])=>ACTIVE_RUN_STATUSES.some(s=>s===status);
export function createRunRecovery(db: AdmissionDatabase) {
  async function ownerOperation(identity:ChatIdentity,runId:string,cancel:boolean) {
    if(!z.uuid().safeParse(runId).success)throw new AdmissionError('NOT_FOUND');
    await db.transaction(async tx=>{
      const session=await lockCompletionSession(tx,identity.user.id,identity.sessionId);
      const {run,now}=await lockOwnedRun(tx,identity.user.id,runId);
      if(session.expiresAt<=now||session.createdAt.getTime()+30*86400000<=now.getTime())throw new AdmissionError('UNAUTHENTICATED');
      if(active(run.status)&&(cancel||run.deadlineAt<=now))await settleFailureLocked(tx,run,now,'REQUEST_TIMEOUT',cancel&&run.deadlineAt>now);
    });
  }
  return {
    async activeForConversation(identity:ChatIdentity,conversationId:string) {
      const [row]=await db.select({id:runs.id}).from(runs).innerJoin(appUsers,eq(appUsers.id,runs.userId))
        .innerJoin(session,and(eq(session.id,identity.sessionId),eq(session.userId,identity.user.id),sql`${session.expiresAt}>clock_timestamp()`,sql`${session.createdAt}+interval '30 days'>clock_timestamp()`))
        .where(and(eq(runs.conversationId,conversationId),eq(appUsers.authSubject,identity.user.id),inArray(runs.status,[...ACTIVE_RUN_STATUSES]))).limit(1);
      return row?.id;
    },
    cancel:(identity:ChatIdentity,runId:string)=>ownerOperation(identity,runId,true),
    expire:(identity:ChatIdentity,runId:string)=>ownerOperation(identity,runId,false),
    async sweep(deadline=performance.now()+25000,budgetKey?:string) {
      // Scan without row locks; acquire the same per-owner lock order as the request path.
      const candidates=await db.select({id:runs.id,subject:appUsers.authSubject}).from(runs)
        .innerJoin(appUsers,eq(appUsers.id,runs.userId)).leftJoin(runSettlements,eq(runSettlements.runId,runs.id))
        .where(and(budgetKey?eq(runs.operatorBudgetKey,budgetKey):undefined,or(and(inArray(runs.status,[...ACTIVE_RUN_STATUSES]),lte(runs.deadlineAt,sql`clock_timestamp()`)),
          and(inArray(runs.status,['FAILED','BLOCKED','CANCELLED','TIMED_OUT']),isNull(runSettlements.runId)))))
        .orderBy(runs.deadlineAt,runs.id).limit(10);
      let recovered=0,failed=0;
      for(const candidate of candidates) {
        if(performance.now()>=deadline)break;
        try {
          const changed=await db.transaction(async(tx:AdmissionTransaction)=>{
            const {run,now}=await lockOwnedRun(tx,candidate.subject,candidate.id);
            if(active(run.status)&&run.deadlineAt>now||run.status==='COMPLETED')return false;
            const [receipt]=await tx.select().from(runSettlements).where(eq(runSettlements.runId,run.id));
            if(receipt) {if(active(run.status))throw new AdmissionError('CONFLICT');return false;}
            await settleFailureLocked(tx,run,now,'REQUEST_TIMEOUT');return true;
          });
          if(changed)recovered++;
        }catch{failed++;}
      }
      return {scanned:candidates.length,recovered,failed};
    },
  };
}
