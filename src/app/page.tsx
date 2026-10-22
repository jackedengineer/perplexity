import Link from "next/link";

export default function HomePage() {
  return (
    <main id="main" className="welcome">
      <Link className="wordmark" href="/" aria-label="Perplex home">perplex<span>✳</span></Link>
      <p className="eyebrow">A little curiosity goes a long way</p>
      <h1>Good questions.<br /><em>Clearer answers.</em></h1>
      <p className="intro">A thoughtful place to explore what’s on your mind, with sources you can follow.</p>
      <Link className="button" href="/sign-in">Make room for curiosity <span aria-hidden="true">↗</span></Link>
      <p className="footnote">Your questions deserve a little more context.</p>
    </main>
  );
}
