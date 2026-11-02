import {PRO_OFFER} from '@/lib/pro-offer';
import {and,eq,gt,inArray,lte,or,sql} from 'drizzle-orm';
import {billingCheckouts,jobPeriods,maintenanceStatus,operatorUsageBuckets} from '@/db/schema';
import {jobConfiguration} from '@/server/jobs/configuration';
import {deepResearch} from '@/server/deep-research/contracts';
import {JobError} from '@/server/jobs/contracts';
import {cloudflareProviderEnvironment} from '@/server/jobs/cloudflare-configuration';
import {databaseNow,type JobTransaction} from '@/server/jobs/store';
export type LivePilot={budgetKey:string;providerExpiresAt:Date};
const deliveryWindowMs=35*86400000;
// Seven reports plus one full reserved retry each. Unknown spend is never released.
const minimumCapacity=BigInt(PRO_OFFER.maxStartedAttempts)*deepResearch.steps.reduce((n,s)=>n+s.capMicroUsd,0n);
export function livePilotConfiguration(env:Record<string,string|undefined>=process.env):LivePilot{
 const config=jobConfiguration(env),expiry=env.PAID_PILOT_PROVIDER_EXPIRES_AT;
 if(config.mode!=='LIVE'||env.ENABLE_RAZORPAY_LIVE_CHECKOUT!=='true'||!expiry||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(expiry))throw new JobError('DISABLED');
 cloudflareProviderEnvironment(env);
 const providerExpiresAt=new Date(expiry);if(!Number.isFinite(providerExpiresAt.getTime()))throw new JobError('DISABLED');
 return {budgetKey:config.budgetKey,providerExpiresAt};
}
export async function assertPilotCapacity(tx:JobTransaction,policy:LivePilot,resumeCheckoutId?:string){
 await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
 // Serializes the entire LIVE pilot, including different owners. An UNKNOWN
 // create retains the sole seat; provider uncertainty is not free capacity.
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('live-pilot-checkout',0))`);
 const now=await databaseNow(tx);
 // Native reconciliation observes Razorpay's one-hour unpaid expiry. Never
 // release on local age: UNKNOWN creates and unexpired paid obligations retain
 // capacity even when the checkout itself has reached a terminal state.
 const existing=await tx.select({id:billingCheckouts.id,state:billingCheckouts.state}).from(billingCheckouts).where(and(eq(billingCheckouts.environment,'LIVE'),or(
  inArray(billingCheckouts.state,['CREATING','READY','UNKNOWN']),
  sql`EXISTS (SELECT 1 FROM ${jobPeriods} WHERE ${jobPeriods.subscriptionId}=${billingCheckouts.subscriptionId} AND ${jobPeriods.environment}='LIVE' AND ${jobPeriods.state}='ACTIVE' AND ${jobPeriods.endsAt}>${now})`,
 ))).limit(2);
 if(existing.length&&!(existing.length===1&&existing[0].id===resumeCheckoutId&&existing[0].state==='READY'))throw new JobError('QUOTA');
 const [health]=await tx.select().from(maintenanceStatus).where(eq(maintenanceStatus.name,'paid-worker:'+policy.budgetKey));
 if(!health||health.outcome!=='COMPLETED'||!health.completedAt||health.completedAt>now||health.completedAt.getTime()<now.getTime()-5*60000)throw new JobError('UNAVAILABLE');
 const [period]=await tx.select().from(operatorUsageBuckets).where(and(eq(operatorUsageBuckets.budgetKey,policy.budgetKey),eq(operatorUsageBuckets.kind,'PERIOD'),lte(operatorUsageBuckets.startsAt,now),gt(operatorUsageBuckets.endsAt,now))).orderBy(operatorUsageBuckets.id).limit(1).for('update');
 if(!period||period.providerLimitMicroUsd>5_000_000n||period.endsAt.getTime()>policy.providerExpiresAt.getTime()||period.endsAt.getTime()<now.getTime()+deliveryWindowMs)throw new JobError('UNAVAILABLE');
 if(period.providerLimitMicroUsd-period.reservedProviderMicroUsd-period.settledProviderMicroUsd<minimumCapacity)throw new JobError('QUOTA');
}
