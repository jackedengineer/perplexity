import {notFound} from 'next/navigation';
import {getCurrentSession} from '@/lib/current-session';
import {getDb} from '@/db';
import {billingEnabled} from '@/server/payments/service';
import {billingStatus} from '@/server/payments/billing';
import {BillingConsole} from '@/components/jobs/billing-console';
export default async function BillingPage(){
 if(!billingEnabled())notFound();const session=await getCurrentSession();if(!session||session.user.isAnonymous||!session.user.emailVerified)notFound();
 return <BillingConsole initial={await billingStatus(getDb(),session.user.id)}/>;
}
