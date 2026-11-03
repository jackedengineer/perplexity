import {and,eq,isNull,lte,gt,sql} from 'drizzle-orm';
import {appUsers,user,usageBuckets,guestLinks,jobPeriods} from '@/db/schema';
import type {AdmissionDatabase} from '@/server/runs/usage';
import {AdmissionError} from '@/server/runs/errors';
export async function readUsage(db:AdmissionDatabase,subject:string) {
 return db.transaction(async tx=>{
  await tx.insert(appUsers).values({authSubject:subject}).onConflictDoNothing();
  const [owner]=await tx.select({id:appUsers.id,guest:user.isAnonymous,verified:user.emailVerified}).from(appUsers).innerJoin(user,eq(user.id,appUsers.authSubject)).where(eq(appUsers.authSubject,subject));
  if(!owner||!owner.guest&&!owner.verified)throw new AdmissionError('UNAUTHENTICATED');
  await tx.execute(sql`SELECT ensure_free_credits(${owner.id}::uuid)`);
  const [{now}]=await tx.select({now:sql<string>`clock_timestamp()::text`.mapWith(v=>new Date(v))}).from(appUsers).where(eq(appUsers.id,owner.id));
  const buckets=await tx.select().from(usageBuckets).where(and(eq(usageBuckets.userId,owner.id),isNull(usageBuckets.retiredAt),lte(usageBuckets.startsAt,now),gt(usageBuckets.endsAt,now))).orderBy(usageBuckets.id).for('share');
  const period=buckets.find(b=>b.kind==='PERIOD'),day=buckets.find(b=>b.kind==='DAY');
  if(buckets.length!==2||!period||!day)throw new AdmissionError('CONFIGURATION_UNAVAILABLE');
  const links=await tx.select().from(guestLinks).where(eq(guestLinks.userId,owner.id));
  function view(bucket:typeof usageBuckets.$inferSelect) {
   const carry=links.filter(l=>l.linkedAt>=bucket.startsAt&&l.linkedAt<bucket.endsAt).reduce((n,l)=>n+(bucket.kind==='DAY'?l.dayCredits:l.credits),0);
   return {limit:bucket.creditLimit,used:bucket.settledCredits+carry,reserved:bucket.reservedCredits,remaining:Math.max(0,bucket.creditLimit-bucket.settledCredits-bucket.reservedCredits-carry),resetsAt:bucket.endsAt.toISOString()};
  }
  const [paid]=owner.guest?[]:await tx.select({endsAt:jobPeriods.endsAt,limit:jobPeriods.jobLimit,spent:jobPeriods.spentJobs,reserved:jobPeriods.reservedJobs}).from(jobPeriods).where(and(eq(jobPeriods.userId,owner.id),eq(jobPeriods.environment,'LIVE'),eq(jobPeriods.state,'ACTIVE'),lte(jobPeriods.startsAt,now),gt(jobPeriods.endsAt,now))).orderBy(jobPeriods.endsAt).limit(1);
  const subscription=paid?{plan:'PRO' as const,endsAt:paid.endsAt.toISOString(),reportsRemaining:Math.max(0,paid.limit-paid.spent-paid.reserved)}:null;
  return {subscription,tier:owner.guest?'GUEST' as const:'FREE' as const,period:view(period),day:view(day),paymentsEnabled:false as const};
 });
}
