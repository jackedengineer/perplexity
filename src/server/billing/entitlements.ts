import {and,eq,gte,lt,sql} from 'drizzle-orm';
import {appUsers,user,guestLinks} from '@/db/schema';
import type {AdmissionTransaction} from '@/server/runs/usage';
import {AdmissionError} from '@/server/runs/errors';
import type {AdmissionPolicy} from '@/server/runs/policy';
import {entitledModel} from '@/server/ai/catalog';
import {freeWindows} from './periods';
import {DAILY_ANSWER_LIMIT,readDailyAnswers} from './daily-answers';
export async function prepareEntitlement(tx:AdmissionTransaction,principal:string,modelKey:string,base:AdmissionPolicy,now:Date) {
 const [identity]=await tx.select({guest:user.isAnonymous,verified:user.emailVerified}).from(appUsers).innerJoin(user,eq(user.id,appUsers.authSubject)).where(eq(appUsers.id,principal));
 if(!identity||!identity.guest&&!identity.verified)throw new AdmissionError('UNAUTHENTICATED');
 const model=entitledModel(modelKey,identity.guest);
 await tx.execute(sql`SELECT ensure_free_credits(${principal}::uuid)`);
 const windows=freeWindows(now);
 const answers=await readDailyAnswers(tx,principal,now);
 if(answers.used>=DAILY_ANSWER_LIMIT)throw new AdmissionError('BUDGET_EXCEEDED');
 const links=await tx.select().from(guestLinks).where(and(eq(guestLinks.userId,principal),gte(guestLinks.linkedAt,windows.period.startsAt),lt(guestLinks.linkedAt,windows.period.endsAt)));
 return {policy:{...base,answerCredits:model.credits,catalogVersion:"trials-v1",priceVersion:"credits-v1",attemptsPerMinute:identity.guest?1:3,attemptsPerDay:20},
  carryPeriod:links.reduce((n,l)=>n+l.credits,0),carryDay:links.filter(l=>l.linkedAt>=windows.day.startsAt).reduce((n,l)=>n+l.dayCredits,0)};
}
