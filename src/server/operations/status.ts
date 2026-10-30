import {sql,and,eq,gt,lte} from 'drizzle-orm';
import {maintenanceStatus,operatorUsageBuckets,runs,ACTIVE_RUN_STATUSES} from '@/db/schema';
import type {AdmissionDatabase} from '@/server/runs/usage';
import {parseAdmissionPolicyEnvironment} from '@/server/runs/env';
export async function operationsStatus(db:AdmissionDatabase) {
 const now=new Date(),key=parseAdmissionPolicyEnvironment(process.env).operatorBudgetKey;
 const budgets=await db.select().from(operatorUsageBuckets).where(and(eq(operatorUsageBuckets.budgetKey,key),lte(operatorUsageBuckets.startsAt,now),gt(operatorUsageBuckets.endsAt,now))).limit(3);
 const maintenance=await db.select().from(maintenanceStatus).limit(10);
 const [counts]=await db.select({stale:sql<number>`count(*) filter (where ${runs.status} in (${sql.join(ACTIVE_RUN_STATUSES.map(s=>sql`${s}`),sql`,`)}) and ${runs.deadlineAt}<clock_timestamp())::integer`,
  failed:sql<number>`count(*) filter (where ${runs.status} in ('FAILED','TIMED_OUT') and ${runs.createdAt}>clock_timestamp()-interval '24 hours')::integer`}).from(runs).where(eq(runs.operatorBudgetKey,key));
 // Metadata only; this is not an inference call. Failure never reports healthy.
 let provider:{remaining:number;expiresAt:string|null}|null=null;
 try {
  const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`},cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(r.ok){const {data}=await r.json();if(Number.isFinite(data.limit_remaining))provider={remaining:data.limit_remaining,expiresAt:data.expires_at??null};}
 }catch{/* Show unavailable rather than leaking upstream errors. */}
 return {checkedAt:now.toISOString(),budgets:budgets.map(b=>({kind:b.kind,endsAt:b.endsAt!.toISOString(),remainingMicroUsd:(b.providerLimitMicroUsd-b.reservedProviderMicroUsd-b.settledProviderMicroUsd).toString()})),
  maintenance:maintenance.map(m=>({name:m.name,outcome:m.outcome,completedAt:m.completedAt?.toISOString()??null})),counts,provider};
}
