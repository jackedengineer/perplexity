import { and,eq,inArray,or,sql } from 'drizzle-orm';
import { z } from 'zod';
import { ACTIVE_RUN_STATUSES,providerCalls,providerUsageResolutions,runSettlements,runReconciliations,usageReservations,usageBuckets,operatorUsageBuckets,appUsers,runs } from '@/db/schema';
import type { AdmissionDatabase } from './usage';
import { lockOwnedRun } from './lock';
import { AdmissionError } from './errors';
export function createUsageReconciliation(db:AdmissionDatabase) {
  async function reconcile(subject:string,runId:string) {
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
  }
  return {reconcile,async sweep(deadline=performance.now()+25000,budgetKey?:string) {
    if(performance.now()>=deadline)return {scanned:0,reconciled:0,failed:0};
    // Only actionable holds enter the bounded batch. Unresolved old calls cannot
    // starve a later receipt that actually changes accounting.
    const candidates=await db.select({id:runs.id,subject:appUsers.authSubject}).from(runs)
      .innerJoin(appUsers,eq(appUsers.id,runs.userId)).innerJoin(runSettlements,eq(runSettlements.runId,runs.id))
      .where(and(budgetKey?eq(runs.operatorBudgetKey,budgetKey):undefined,eq(runs.accountingVersion,1),sql`${runs.status} NOT IN ('RECEIVED','CHECKING_INPUT','PLANNING','SEARCHING','PREPARING_EVIDENCE','GENERATING','CHECKING_OUTPUT')`,
        or(and(sql`coalesce((select remaining_held_micro_usd from run_reconciliations where run_id=${runs.id} order by version desc limit 1),${runSettlements.heldProviderMicroUsd})>0`,
        sql`(
          (select coalesce(sum(coalesce(p.cost_micro_usd,c.cost_micro_usd,0)),0) from provider_calls c left join provider_usage_resolutions p on p.call_id=c.id where c.run_id=${runs.id})
          > ${runSettlements.knownProviderMicroUsd}+(select coalesce(sum(charged_micro_usd),0) from run_reconciliations where run_id=${runs.id})
          OR NOT EXISTS(select 1 from provider_calls c left join provider_usage_resolutions p on p.call_id=c.id where c.run_id=${runs.id} and p.call_id is null and (c.cost_micro_usd is null or c.status in ('STARTED','UNKNOWN')))
        )`),sql`EXISTS(select 1 from provider_calls c left join provider_usage_resolutions p on p.call_id=c.id where c.run_id=${runs.id} and (c.cost_micro_usd>c.cap_micro_usd or p.cost_micro_usd<c.cost_micro_usd))`))).orderBy(runSettlements.createdAt,runs.id).limit(10);
    let reconciled=0,failed=0;
    for(const candidate of candidates) {if(performance.now()>=deadline)break;try{if(await reconcile(candidate.subject,candidate.id)==='RECONCILED')reconciled++;}catch{failed++;}}
    return {scanned:candidates.length,reconciled,failed};
  }};
}
