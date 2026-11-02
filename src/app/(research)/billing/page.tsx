import {notFound} from 'next/navigation';
import {getCurrentSession} from '@/lib/current-session';
import {billingEnabled,currentBillingStatus} from '@/server/payments/service';
import {BillingConsole} from '@/components/jobs/billing-console';
export default async function BillingPage(){
 if(!billingEnabled())notFound();const session=await getCurrentSession();if(!session||session.user.isAnonymous||!session.user.emailVerified)notFound();
 return <BillingConsole initial={await currentBillingStatus(session.user.id)}/>;
}
