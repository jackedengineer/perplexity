import { and,eq,inArray,sql } from 'drizzle-orm';
import { z } from 'zod';
import { ACTIVE_RUN_STATUSES,providerCalls,providerUsageResolutions,runSettlements,runReconciliations,usageReservations,usageBuckets,operatorUsageBuckets } from '@/db/schema';
import type { AdmissionDatabase } from './usage';
import { lockOwnedRun } from './lock';
import { AdmissionError } from './errors';
export function createUsageReconciliation(db:AdmissionDatabase) {
  return { async reconcile(subject:string,runId:string) {
    if(!z.uuid().safeParse(runId).success)throw new AdmissionError('NOT_FOUND');
    return db.transaction(async tx=>{
      const {run,now}=await lockOwnedRun(tx,subject,runId);
      if(ACTIVE_RUN_STATUSES.some(s=>s===run.status))return 'UNCHANGED' as const;
      const [receipt]=await tx.select().from(runSettlements).where(eq(runSettlements.runId,runId));
      if(!receipt||run.accountingVersion!==1)return 'UNRESOLVED' as const;
      const previous=await tx.select().from(runReconciliations).where(eq(runReconciliations.runId,runId)).orderBy(runReconciliations.version);
      const held=previous.at(-1)?.remainingHeldMicroUsd??receipt.heldProviderMicroUsd;
      const [reservation]=await tx.select().from(usageReservations).where(eq(usageReservations.runId,runId));
      if(!reservation)throw new AdmissionError('CONFLICT');
      // Serializes with late provider finish updates; a following sweep can see later receipts.
      const calls=await tx.select().from(providerCalls).where(eq(providerCalls.runId,runId)).orderBy(providerCalls.id).for('update');
      const resolutions=await tx.select().from(providerUsageResolutions).where(eq(providerUsageResolutions.runId,runId));
      let known=0n,unknown=false;
      for(const call of calls) {
        const resolution=resolutions.find(r=>r.callId===call.id),cost=resolution?.costMicroUsd??call.costMicroUsd;
        if(resolution&&call.costMicroUsd!==null&&resolution.costMicroUsd<call.costMicroUsd)throw new AdmissionError('CONFLICT');
        if(cost!==null&&cost>call.capMicroUsd)throw new AdmissionError('BUDGET_EXCEEDED');
        known+=cost??0n;
        if(!resolution&&(cost===null||call.status==='STARTED'||call.status==='UNKNOWN'))unknown=true;
      }
      const alreadyKnown=receipt.knownProviderMicroUsd+previous.reduce((sum,r)=>sum+r.chargedMicroUsd,0n);
      if(held===0n) {if(known!==alreadyKnown)throw new AdmissionError('BUDGET_EXCEEDED');return 'UNCHANGED' as const;}
      const charged=known-alreadyKnown,remaining=unknown?reservation.providerReserveMicroUsd-known:0n;
      const released=held-charged-remaining,moved=charged+released;
      if(charged<0n||remaining<0n||released<0n||known>reservation.providerReserveMicroUsd)throw new AdmissionError('BUDGET_EXCEEDED');
      if(moved===0n)return unknown?'UNRESOLVED' as const:'UNCHANGED' as const;
      const userIds=[reservation.periodBucketId,reservation.dayBucketId],operatorIds=[reservation.operatorPeriodBucketId,reservation.operatorDayBucketId];
      const users=await tx.select({id:usageBuckets.id}).from(usageBuckets).where(and(eq(usageBuckets.userId,run.userId),inArray(usageBuckets.id,userIds))).orderBy(usageBuckets.id).for('update');
      const operators=await tx.select({id:operatorUsageBuckets.id}).from(operatorUsageBuckets).where(and(eq(operatorUsageBuckets.budgetKey,run.operatorBudgetKey),inArray(operatorUsageBuckets.id,operatorIds))).orderBy(operatorUsageBuckets.id).for('update');
      if(users.length!==2||operators.length!==2)throw new AdmissionError('CONFLICT');
      const changedUsers=await tx.update(usageBuckets).set({reservedProviderMicroUsd:sql`${usageBuckets.reservedProviderMicroUsd}-${moved}`,
        settledProviderMicroUsd:sql`${usageBuckets.settledProviderMicroUsd}+${charged}`}).where(and(eq(usageBuckets.userId,run.userId),inArray(usageBuckets.id,userIds),sql`${usageBuckets.reservedProviderMicroUsd}>=${moved}`)).returning({id:usageBuckets.id});
      const changedOperators=await tx.update(operatorUsageBuckets).set({reservedProviderMicroUsd:sql`${operatorUsageBuckets.reservedProviderMicroUsd}-${moved}`,
        settledProviderMicroUsd:sql`${operatorUsageBuckets.settledProviderMicroUsd}+${charged}`}).where(and(eq(operatorUsageBuckets.budgetKey,run.operatorBudgetKey),inArray(operatorUsageBuckets.id,operatorIds),sql`${operatorUsageBuckets.reservedProviderMicroUsd}>=${moved}`)).returning({id:operatorUsageBuckets.id});
      if(changedUsers.length!==2||changedOperators.length!==2)throw new AdmissionError('CONFLICT');
      await tx.insert(runReconciliations).values({runId,version:previous.length+1,previousHeldMicroUsd:held,chargedMicroUsd:charged,releasedMicroUsd:released,remainingHeldMicroUsd:remaining,createdAt:now});
      return 'RECONCILED' as const;
    });
  } };
}
