import Link from 'next/link';
import {PublicPolicy} from '@/components/public-policy';
import {SUPPORT} from '@/lib/pro-offer';

export const metadata={title:'Contact and support'};
export default function ContactPage(){
  return <PublicPolicy title="How can we help?" notice="Support for the independent perplexity research application.">
    <h2>Contact the operator</h2>
    <p><strong>{SUPPORT.operator}</strong><br/>
      <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a></p>
    <p>For research errors, account access, privacy requests or billing issues, email the address above.
      Include a short description and the relevant conversation, job or payment reference if available.
      Never send passwords, OTPs, API keys or full card/bank details.</p>
    <h2>Privacy and payment questions</h2>
    <p>Send account-related requests from the email address used to sign in. We may verify ownership before
      disclosing private records or making account changes. Read our <Link href="/privacy">privacy policy</Link>
      {' '}and planned <Link href="/refunds">cancellation and refund policy</Link> for details.</p>
    <p>Paid pilot availability is checked in Billing. A TEST checkout does not create a real paid subscription.</p>
  </PublicPolicy>;
}
