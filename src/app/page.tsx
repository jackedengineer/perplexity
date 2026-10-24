import Link from "next/link";
import {PolicyLinks} from '@/components/public-policy';

export default function HomePage() {
  return (
    <main id="main" className="welcome">
      <Link className="wordmark" href="/" aria-label="perplexity home">perplexity<span>✳</span></Link>
      <p className="eyebrow">A little curiosity goes a long way</p>
      <h1>Good questions.<br /><em>Clearer answers.</em></h1>
      <p className="intro">Explore questions with AI-assisted web research, private conversation history, and sources you can follow.</p>
      <Link className="button" href="/sign-in">Make room for curiosity <span aria-hidden="true">↗</span></Link>
      <p className="footnote">Your questions deserve a little more context.</p>
      <PolicyLinks />
      <p className="footnote">Independent research project. Not affiliated with Perplexity AI.</p>
    </main>
  );
}
