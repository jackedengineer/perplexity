import {createHash} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {z} from 'zod';
import {requestRateBuckets as buckets} from '@/db/schema';
import type {AdmissionDatabase} from './usage';
import {getAttemptWindows} from './windows';
import {AdmissionError} from './errors';
const policySchema=z.strictObject({userMinute:z.int().min(1).max(10000),userDay:z.int().min(1).max(10000),anonymousMinute:z.int().min(1).max(10000),anonymousDay:z.int().min(1).max(10000)});
export const REQUEST_RATE_POLICY=Object.freeze({userMinute:30,userDay:200,anonymousMinute:120,anonymousDay:2000});
export function requestRateKey(subject:string|null,namespace:string) {
 return (subject===null?'anon:':'user:')+createHash('sha256').update(subject===null?'perplex:anonymous:'+namespace:'perplex:subject:'+subject).digest('hex');
}
export function createRequestLimiter(db:AdmissionDatabase,namespace:string,policyInput:unknown=REQUEST_RATE_POLICY) {
 const parsed=policySchema.safeParse(policyInput);
 if(!parsed.success||!z.string().regex(/^[A-Za-z0-9._-]{1,64}$/u).safeParse(namespace).success)throw new AdmissionError('CONFIGURATION_UNAVAILABLE');
 const policy=parsed.data;
 return {async consume(subject:string|null) {
  const bucketKey=requestRateKey(subject,namespace),minute=subject===null?policy.anonymousMinute:policy.userMinute,day=subject===null?policy.anonymousDay:policy.userDay;
  const allowed=await db.transaction(async tx=>{
   await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
   const [{now}]=await tx.select({now:sql<string>`clock_timestamp()::text`.mapWith(value=>new Date(value))}).from(sql`(SELECT 1) AS clock`);
   // Expected denial commits partial increments; no downstream transaction can undo them.
   const changed=await tx.insert(buckets).values(getAttemptWindows(now).map(window=>({...window,bucketKey,attempts:1})))
    .onConflictDoUpdate({target:[buckets.bucketKey,buckets.kind,buckets.startsAt],set:{attempts:sql`${buckets.attempts}+1`},
     setWhere:sql`${buckets.attempts}<CASE WHEN ${buckets.kind}='MINUTE' THEN ${minute}::integer ELSE ${day}::integer END`}).returning({kind:buckets.kind});
   return changed.length===2;
  });
  if(!allowed)throw new AdmissionError('RATE_LIMITED');
 }};
}
