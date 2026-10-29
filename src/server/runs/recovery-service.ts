import 'server-only';
import {cleanExpiredGuests} from '@/server/auth/guest-retention';
import {cleanExpiredContent} from '@/server/conversations/retention';
import { getDb } from '@/db';
import {recordMaintenance} from '@/server/operations/maintenance';
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
 async sweep(scheduled){
  const db=getDb(),deadline=performance.now()+25000;
  return recordMaintenance(db,async()=>{
  const result={recovery:await createRunRecovery(db).sweep(deadline),usage:await createUsageReconciliation(db).sweep(deadline),retention:await cleanExpiredContent(db,deadline),guests:await cleanExpiredGuests(db,deadline)};
  console.info(JSON.stringify({event:'runs.recovery_counts',...result}));
  if(result.recovery.failed+result.usage.failed>0||performance.now()>=deadline)throw new Error('Recovery incomplete');
  return result;
  },scheduled?'scheduled-recovery':'recovery');
 },
 log:event=>console.info(JSON.stringify(event)),
});
