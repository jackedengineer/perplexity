import {configuredResearchModels} from '@/server/deep-research/configuration';
import {billingEnabled} from '@/server/payments/service';
import {notFound} from 'next/navigation';
import {getCurrentSession} from '@/lib/current-session';
import {getDb} from '@/db';
import {jobsEnabled} from '@/server/jobs/service';
import {listJobs} from '@/server/jobs/admission';
import {jobId} from '@/server/jobs/contracts';
import {JobConsole} from '@/components/jobs/job-console';
import {jobConfiguration} from '@/server/jobs/configuration';
export default async function JobsPage({searchParams}:{searchParams:Promise<{job?:string}>}){
 if(!jobsEnabled())notFound();const session=await getCurrentSession();if(!session||session.user.isAnonymous||!session.user.emailVerified)notFound();
 const params=await searchParams,parsed=jobId.safeParse(params.job);
 const initial=await listJobs(getDb(),session.user.id);
 const selected=parsed.success?parsed.data:initial.find(j=>['QUEUED','RUNNING'].includes(j.state))?.id??null;
 let deepAvailable=false;try{configuredResearchModels();deepAvailable=true;}catch{/* Default off until providers are configured. */}
 return <JobConsole key={selected??'new'} initialJobs={initial.map(j=>({...j,createdAt:j.createdAt.toISOString()}))} initialId={selected} deepAvailable={deepAvailable} billingAvailable={billingEnabled()} environment={jobConfiguration().mode}/>;
}
