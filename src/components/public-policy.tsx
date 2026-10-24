import Link from 'next/link';
import type { ReactNode } from 'react';

export function PolicyLinks() {
  return <nav className="policy-links" aria-label="Policies and support">
    <Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link>
    <a href="mailto:trainwithchirag@gmail.com">Contact</a>
  </nav>;
}

export function PublicPolicy({title,children}:{title:string;children:ReactNode}) {
  return <main id="main" className="policy-page">
    <header><Link className="wordmark" href="/">perplexity<span aria-hidden="true">✳</span></Link>
      <Link className="back-link" href="/">← Home</Link></header>
    <p className="eyebrow">Your questions. Your choices.</p>
    <h1>{title}</h1>
    <aside className="policy-draft">Draft for owner review · 24 October 2026.
      This proposed document has not been approved for the public launch.</aside>
    <article>{children}</article>
    <footer><p>Questions? <a href="mailto:trainwithchirag@gmail.com">trainwithchirag@gmail.com</a></p>
      <PolicyLinks /><p>Independent research project. Not affiliated with Perplexity AI.</p></footer>
  </main>;
}
