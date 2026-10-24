import 'server-only';
import {cleanExpiredGuests} from '@/server/auth/guest-retention';
import {cleanExpiredContent} from '@/server/conversations/retention';
import { getDb } from '@/db';
import { getCurrentSession } from '@/lib/current-session';
import { getServerEnv } from '@/lib/env';
import { createAnswerDelivery } from '@/server/chat/delivery';
import { createRunRecovery } from './recover';
import { createUsageReconciliation } from './reconcile';
import { createRecoveryHttp } from './recovery-http';
export const recoveryHttp=createRecoveryHttp({
 identity:getCurrentSession,origin:()=>getServerEnv().BETTER_AUTH_URL,secret:()=>process.env.CRON_SECRET,
 cancel:(identity,id)=>createRunRecovery(getDb()).cancel(identity,id),
 load:(identity,id)=>createAnswerDelivery(getDb()).load(identity,id),
 async sweep(){const db=getDb(),deadline=performance.now()+25000;const result={recovery:await createRunRecovery(db).sweep(deadline),usage:await createUsageReconciliation(db).sweep(deadline),retention:await cleanExpiredContent(db,deadline),guests:await cleanExpiredGuests(db,deadline)};console.info(JSON.stringify({event:"runs.recovery_counts",...result}));if(result.recovery.failed+result.usage.failed>0)throw new Error("Recovery requires investigation");return result;},
 log:event=>console.info(JSON.stringify(event)),
});
