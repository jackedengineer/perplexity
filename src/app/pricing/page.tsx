import {getCurrentSession} from '@/lib/current-session';
import {ProCheckoutLink} from '@/components/pro-checkout-link';
import Link from 'next/link';
import {PublicPolicy} from '@/components/public-policy';
import {PRO_OFFER} from '@/lib/pro-offer';
import './pricing.css';
import {connection} from 'next/server';
import {purchasesEnabled} from '@/server/payments/service';
import {paymentConfiguration} from '@/server/payments/config';

export const metadata={title:'Pricing'};

export default async function PricingPage(){
  await connection();let enabled=false;try{enabled=paymentConfiguration().mode==='LIVE'&&purchasesEnabled();}catch{/* Public offer does not require billing configuration. */}
  const session=await getCurrentSession();
  const signedIn=!!session&&!session.user.isAnonymous&&session.user.emailVerified;
  return <PublicPolicy title="More room to research" notice={enabled?'One month of Pro. Availability is checked before checkout; your paid month does not renew automatically.':'Pro is coming soon. Purchases are not available yet; you will not be charged from this page.'}>
    <p>Start with everyday questions. When you need a closer look, Pro brings together a deeper search,
      selected page excerpts and a structured report with sources.</p>
    <section className="pricing-offer" aria-labelledby="pro-title">
      <div className="pricing-heading"><h2 id="pro-title">{PRO_OFFER.name}</h2><span>{enabled?'One month of Pro':'Coming soon'}</span></div>
      <p className="pricing-amount">₹{PRO_OFFER.amountPaise/100}<small> / month</small></p>
      <p>The advertised monthly total. No extra checkout fee.</p>
      <ul>
        <li><strong>{PRO_OFFER.deepResearchRuns} Deep Research runs per paid month.</strong> Unused runs do not roll over.</li>
        <li>Multiple search rounds and selected page excerpts for a more considered report.</li>
        <li>Sources, a summary, analysis, and a section for limitations and conflicting evidence.</li>
        <li>Saved progress, reconnect after closing the page, Stop, and Markdown report export.</li>
      </ul>
      <p>Browser Tasks are not included. Deep Research is intended for web research; it does not make purchases,
        submit forms or take actions on other websites.</p>
      {enabled&&<ProCheckoutLink signedIn={signedIn}/>}
      {enabled&&<p className="pricing-checkout-note">Review availability and payment details before paying. No automatic renewal.</p>}
    </section>
    <h2>How a paid month works</h2>
    <p>Pro covers one monthly billing cycle through Razorpay, without automatic renewal. Google sign-in is required so your subscription
      and private research belong to your account. A run becomes available only after the server verifies a
      captured subscription payment. Approving a payment mandate alone does not grant access.</p>
    <p>A completed report uses one run. Failed or cancelled work does not consume a completed-run allowance.
      To prevent repeated cancellations from exhausting shared capacity, the paid month includes at most {PRO_OFFER.maxStartedAttempts} started attempts, including failed or cancelled work. Cancelling before execution starts does not use an attempt. Only one research job can run at a time. The service may temporarily pause new work during service
      interruptions; an allowance is not a guarantee of immediate availability.</p>
    <h2>Cancellation and refunds</h2>
    <p>Pro does not renew automatically. Access already paid for
      continues to the end of that paid period. The offer does not include voluntary refunds for
      change of mind or unused runs. Rights and remedies required by applicable law remain available.</p>
    <p>Read the <Link href="/refunds">cancellation and refund policy</Link>, <Link href="/terms">terms</Link>,
      {' '}and <Link href="/privacy">privacy policy</Link> before subscribing.</p>
    <h2>Try everyday research</h2>
    <p>Existing guest trials and registered-account answer allowances are separate from the Pro
      subscription. Available credits and limits appear in the application.</p>
    <Link className="button" href="/workspace">Open your workspace <span aria-hidden="true">↗</span></Link>
  </PublicPolicy>;
}
