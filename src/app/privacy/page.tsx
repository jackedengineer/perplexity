import {PublicPolicy} from '@/components/public-policy';

export const metadata={title:'Privacy policy'};
export default function PrivacyPage(){
  return <PublicPolicy title="Privacy policy">
    <p>This notice describes the independent perplexity research application at
      perplexity-gold-alpha.vercel.app. Contact the project operator at
      {' '}<a href="mailto:trainwithchirag@gmail.com">trainwithchirag@gmail.com</a> about privacy or your data.</p>
    <h2>What we collect</h2>
    <ul>
      <li><strong>Account information:</strong> Google account identifier, name, email, email-verification status
        and profile image, plus authentication records needed to sign you in. We do not receive your Google
        password or request access to your Gmail, Drive or Calendar.</li>
      <li><strong>Research:</strong> questions you submit, saved answers, conversation titles, cited links,
        retrieved excerpts, planning and safety-review records, and feedback you choose to give.</li>
      <li><strong>Service and security records:</strong> session identifiers, session IP address and browser
        information, timestamps, request identifiers, quota usage, provider costs and error/latency metrics.
        Guest-abuse controls store a keyed hash of the trusted network address rather than the raw address.
        Hosting and authentication systems may separately process network addresses.</li>
    </ul>
    <h2>Why we use it</h2>
    <p>We use this information to sign you in, keep conversations private to their owner, retrieve sources,
      generate and check answers, save history, process feedback, enforce quotas, prevent abuse and diagnose
      failures. Basic Google profile details are used for account access; they are not automatically added
      to AI prompts. Information you include in a question may be sent to research providers.</p>
    <h2>Who processes research data</h2>
    <ul>
      <li><strong>Google</strong> authenticates your account when you choose Google sign-in.</li>
      <li><strong>Vercel and Neon</strong> host the application and its database.</li>
      <li><strong>OpenRouter and the selected model provider</strong> process questions, relevant conversation
        context, source excerpts and proposed answers for planning, generation and safety checks. We configure
        routes that require no provider data collection and zero-data-retention support. These routing
        controls do not mean that your content stays on your device.</li>
      <li><strong>Tavily</strong> receives search queries and selected page URLs to retrieve web evidence.</li>
      <li><strong>Cloudflare Turnstile</strong> processes browser and verification information to protect guest
        access when guest trials are enabled.</li>
    </ul>
    <p>These services have their own privacy policies and operational obligations. Infrastructure and
      providers may process data outside India; the production database is configured in Singapore.
      This release does not include advertising, paid checkout or sale of user data.</p>
    <h2>Cookies and guest sessions</h2>
    <p>Essential cookies keep you signed in and protect account actions. Sessions have a seven-day rolling
      validity and a separate thirty-day absolute limit. A guest-trial marker lasts thirty days to prevent
      repeated free grants. Turnstile may use its own browser verification mechanisms. Clearing cookies can
      remove access to unlinked guest history; sign in with Google to retain that history.</p>
    <h2>Retention and deletion</h2>
    <p>Saved registered conversations remain until you delete them. Scheduled cleanup targets unlinked guest
      conversations, retrieved excerpts and private planning/non-content safety records after thirty days;
      cleanup occurs when the maintenance job runs. Approved answers retain citation links after excerpts expire.</p>
    <p>Deleting a conversation removes its visible messages and associated research content from the active
      application database and stops active work from saving a late answer. Content-free deletion markers,
      abuse controls and financial usage records remain for reconciliation and replay protection. This does
      not promise immediate erasure from backups or third-party systems. Backup, security-log and external
      provider retention follow the applicable service settings and provider policies; contact us for
      current details or help with a deletion request.</p>
    <h2>Your choices</h2>
    <p>Use the conversation menu to export approved messages and citation links as JSON or to delete a
      conversation. Contact us for account-level access, correction or deletion requests; identity verification
      may be needed. You can revoke Google access in your Google Account, which does not itself delete saved
      conversations here. Do not submit credentials, confidential information or personal data you are not
      entitled to share.</p>
    <h2>Changes and contact</h2>
    <p>We will show a revised date when this notice changes. Material changes to how research data is used
      should be communicated before they take effect. Send questions or concerns to the contact address above.</p>
  </PublicPolicy>;
}
