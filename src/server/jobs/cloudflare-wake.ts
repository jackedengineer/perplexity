import 'server-only';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {workerBudgetKey} from './configuration';
import {markPaidActivity,type PaidActivityStore} from './paid-activity';
export async function wakeCloudflareJobs(){
 if(process.env.JOB_EXECUTION_BACKEND!=='cloudflare')return;
 const {env}=getCloudflareContext();
 await markPaidActivity((env as unknown as {PAID_ACTIVITY?:PaidActivityStore}).PAID_ACTIVITY,workerBudgetKey());
}
