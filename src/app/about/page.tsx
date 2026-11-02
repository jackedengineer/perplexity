import Link from 'next/link';
import {PublicPolicy} from '@/components/public-policy';
import {SUPPORT} from '@/lib/pro-offer';

export const metadata={title:'About'};
export default function AboutPage(){
  return <PublicPolicy title="Follow your curiosity" notice="An independent research application operated by Chirag Bhugra.">
    <p>perplexity helps you explore questions using AI-assisted web search, sources you can inspect and private
      conversation history. It is an independent project and is not affiliated with Perplexity AI.</p>
    <h2>Research you can follow</h2>
    <p>Everyday research finds web evidence and prepares a checked answer. The planned Pro Deep Research mode
      adds multiple search rounds, selected page excerpts and a structured report that describes limitations
      and conflicting evidence. Progress is saved so closing a tab does not lose an active research job.</p>
    <p>AI answers can contain mistakes. Source links help you investigate; they do not guarantee that every
      claim is supported or correct. Review original material before relying on a report.</p>
    <h2>Who runs this service</h2>
    <p>The project operator is {SUPPORT.operator}. For support or questions about the service, use
      {' '}<a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>.</p>
    <p><Link href="/pricing">Explore the planned Pro offer</Link> or <Link href="/contact">contact support</Link>.</p>
  </PublicPolicy>;
}
