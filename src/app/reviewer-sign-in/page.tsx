import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {connection} from 'next/server';
import {getCurrentSession} from '@/lib/current-session';
import {reviewerConfiguration} from '@/lib/reviewer-policy';
import {ReviewerSignIn} from '@/components/reviewer-sign-in';
import './reviewer.css';

export const metadata={title:'Temporary review access',robots:{index:false,follow:false}};
export default async function ReviewerSignInPage(){
  await connection();
  const policy=reviewerConfiguration(process.env.REVIEWER_LOGIN_CONFIG,process.env.BETTER_AUTH_URL);
  if(!policy)notFound();
  const identity=await getCurrentSession();
  if(identity&&!identity.user.isAnonymous)redirect('/workspace');
  return <main id="main" className="reviewer-page">
    <header><Link className="wordmark" href="/">perplexity<span aria-hidden="true">✳</span></Link>
      <Link className="back-link" href="/sign-in">← Google sign-in</Link></header>
    <section aria-labelledby="reviewer-heading"><p className="eyebrow">Temporary review access</p>
      <h1 id="reviewer-heading">A space to explore.</h1>
      <p>Use the application review credentials supplied by the operator. This is a shared review account:
        please use test questions and avoid personal or confidential information.</p>
      <ReviewerSignIn/>
      <p className="reviewer-note">Access ends {new Date(policy.expiresAt).toLocaleString('en-GB',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})} IST.
        Normal usage limits apply. Purchases and paid features require their usual payment verification.</p>
      <p className="reviewer-note"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·
        {' '}<a href="mailto:trainwithchirag@gmail.com">Contact support</a></p>
    </section>
  </main>;
}
