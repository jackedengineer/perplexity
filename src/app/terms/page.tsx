import {PublicPolicy} from '@/components/public-policy';

export const metadata={title:'Terms of use'};
export default function TermsPage(){
  return <PublicPolicy title="Terms of use">
    <p>These terms concern the independent perplexity project at perplexity-gold-alpha.vercel.app.
      The support contact is <a href="mailto:trainwithchirag@gmail.com">trainwithchirag@gmail.com</a>.</p>
    <h2>The service</h2>
    <p>The application searches web sources and uses AI to prepare answers with citations. Accounts can save
      private conversations, export or delete them, and give feedback. Guest trials, where enabled, have limited
      credits and depend on browser verification. This is an independent software project, not an official
      product of or service affiliated with Perplexity AI.</p>
    <h2>Use answers thoughtfully</h2>
    <p>AI can make mistakes, omit context or cite a source that does not support a claim. Citations identify
      sources; they are not a guarantee of factual accuracy. Check original sources before relying on an answer,
      especially for medical, legal, financial or safety-critical decisions. The service is not a substitute
      for qualified professional advice.</p>
    <h2>Your account and content</h2>
    <p>Use an account you control and keep access secure. Submit only material you have permission to provide.
      You retain your rights in your own content and allow the service and its configured providers to process
      it as needed to provide the requested research, storage and safety checks described in the privacy notice.
      No ownership of third-party web content is transferred to you by an answer or citation.</p>
    <h2>Acceptable use</h2>
    <p>Do not use the application for fraud, credential theft, unauthorized access, malicious software, threats,
      exploitation or unlawful disclosure of private information. Do not evade quotas, impersonate another
      person, attack the service or attempt to access another person’s conversations. Legitimate education,
      prevention and authorized security analysis remain permitted, subject to the safety checks.</p>
    <h2>Credits and availability</h2>
    <p>This release is free and has no enabled checkout or subscription billing. Answer credits are usage
      allowances, not money. Limits, eligible models and reset dates appear in the application. Unsuccessful
      research does not charge answer credits, but incurred provider costs and abuse-attempt limits still apply.
      A service-wide budget may pause research even when your answer credits remain.</p>
    <p>Research may be refused, delayed, cancelled or unavailable because of safety checks, provider outages,
      capacity, maintenance or exhausted budgets. The service is provided on a best-effort basis without a
      promised uptime or guaranteed answer. We may restrict abusive access or change availability. Any future
      paid offering will need separate pricing and payment terms before a purchase.</p>
    <h2>Leaving and requesting help</h2>
    <p>You can stop using the service, export saved conversations and delete their content through the application.
      Contact support for account-level requests or to report an incorrect refusal. Deletion and retention are
      described in the privacy notice. Nothing in these terms is intended to remove rights that
      applicable law does not allow you to waive.</p>
    <h2>Changes</h2>
    <p>Updated terms will carry a revised date. Material changes will be presented before they apply.</p>
  </PublicPolicy>;
}
