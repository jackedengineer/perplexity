import {notFound} from 'next/navigation';
import {getCurrentSession} from '@/lib/current-session';
import {getDb} from '@/db';
import {isOperator} from '@/server/operations/access';
import {operationsStatus} from '@/server/operations/status';
export const dynamic='force-dynamic';
export default async function OperationsPage(){
 const identity=await getCurrentSession();
 if(!isOperator(identity,process.env.OPERATOR_AUTH_SUBJECTS))notFound();
 const status=await operationsStatus(getDb());
 const cron=status.maintenance.find(m=>m.name==='recovery');
 const alerts=[
  ...(status.budgets.length!==2?['Research budget windows are missing or expired.']:[]),
  ...status.budgets.filter(b=>BigInt(b.remainingMicroUsd)<50000n).map(b=>`${b.kind} budget cannot reserve another run.`),
  ...(!status.provider?['Provider key metadata unavailable.']:status.provider.remaining<0.05?['Provider key capacity exhausted.']:[]),
  ...(status.provider?.expiresAt&&Date.parse(status.provider.expiresAt)<Date.parse(status.checkedAt)+86400000?['Provider key expires within 24 hours or has expired.']:[]),
  ...(!cron?.completedAt||cron.outcome!=='COMPLETED'||Date.parse(cron.completedAt)<Date.parse(status.checkedAt)-26*3600000?['Recovery/retention heartbeat is missing, failed or overdue.']:[]),
  ...(status.counts.stale?[`${status.counts.stale} runs need stale-run recovery.`]:[]),
  ...(status.counts.failed?[`${status.counts.failed} failed or timed-out runs in the last 24 hours; inspect provider telemetry.`]:[]),
 ];
 return <main style={{maxWidth:850,margin:'40px auto',padding:24}}><h1>Private operations</h1>
  <p>Checked {status.checkedAt}. Refresh to update. This page does not send background notifications.</p>
  <h2>Alerts</h2><ul>{alerts.length?alerts.map(a=><li key={a}>{a}</li>):<li>No alerts detected.</li>}</ul>
  <h2>Budget and maintenance status</h2><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(status,null,2)}</pre>
 </main>;
}
