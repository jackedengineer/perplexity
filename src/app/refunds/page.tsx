import Link from 'next/link';
import {PublicPolicy} from '@/components/public-policy';
import {SUPPORT} from '@/lib/pro-offer';

export const metadata={title:'Cancellation and refunds'};

export default function RefundsPage(){
  return <PublicPolicy title="Cancellation and refunds" notice="The Pro pilot covers one monthly billing cycle, without automatic renewal. Availability is checked in Billing.">
    <p>This policy applies to the independent perplexity service operated by {SUPPORT.operator}.
      Everyday free access has no subscription fee.</p>
    <h2>Cancel future renewals</h2>
    <p>The current pilot does not renew automatically. For any future renewing offer, use Cancel renewal in your account’s Billing page before the next billing date.
      Wait for the confirmed cancellation status; closing a checkout window or deleting a conversation does
      not cancel a subscription. If account access is unavailable, email <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>
      {' '}from the account’s email address with the subscription identifier. Do not email payment credentials.</p>
    <p>Cancellation stops future renewal charges once confirmed. Your verified paid-through period remains
      available until its displayed end time. Unused runs expire with that period and do not roll over.</p>
    <h2>No voluntary refunds</h2>
    <p>We do not offer voluntary refunds for change of mind, unused runs or cancellation during a paid period.
      A failed or cancelled research job does not consume a completed-run allowance; that is a usage correction,
      not a refund of the subscription payment.</p>
    <h2>Payment problems and legal rights</h2>
    <p>This policy does not exclude remedies required by applicable law, including for a deficient service,
      an incorrect charge or a service that does not match the agreed offer. Report such problems to support
      with your subscription/payment reference and a description of the issue. We may need to verify account
      ownership and the payment record before resolving it.</p>
    <p>If a refund is due and initiated, it is returned to the original payment method. Razorpay’s normal
      refund guidance estimates 7–10 working days for bank processing; the actual time varies by bank and
      payment method. We will share the refund reference after initiation.</p>
    <h2>Delivery</h2>
    <p>Pro is a digital service with no physical shipment. Access begins after the server verifies a captured
      subscription payment. Payment verification can be delayed; contact support if money was deducted but
      access is missing. Do not create a second subscription while the first payment is pending.</p>
    <p>See <Link href="/pricing">pricing and included runs</Link> and the <Link href="/terms">terms of use</Link>.</p>
  </PublicPolicy>;
}
