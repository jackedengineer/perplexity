import {and,eq,gt,lte,sql} from 'drizzle-orm';
import {operatorUsageBuckets} from '@/db/schema';
import type {AdmissionDatabase} from './usage';
export function hasResearchCapacity(rows: Array<{kind:string;providerLimitMicroUsd:bigint;reservedProviderMicroUsd:bigint;settledProviderMicroUsd:bigint}>) {
 return rows.length===2&&['DAY','PERIOD'].every(kind=>rows.filter(r=>r.kind===kind).length===1)&&
  rows.every(r=>r.providerLimitMicroUsd-r.reservedProviderMicroUsd-r.settledProviderMicroUsd>=50000n);
}
export async function researchAvailable(db:AdmissionDatabase,budgetKey:string) {
 await db.execute(sql`SELECT ensure_operator_day(${budgetKey})`);
 const now=new Date();
 const rows=await db.select().from(operatorUsageBuckets).where(and(eq(operatorUsageBuckets.budgetKey,budgetKey),lte(operatorUsageBuckets.startsAt,now),gt(operatorUsageBuckets.endsAt,now))).limit(3);
 return hasResearchCapacity(rows);
}
