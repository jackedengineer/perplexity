import Link from "next/link";
export default function NotFound() {
  return <main id="main" className="state-page"><p className="eyebrow">404 · A small detour</p>
    <h1>This page wandered off.</h1><p>Let’s get you back to familiar ground.</p>
    <Link className="button" href="/">Back to home <span aria-hidden="true">↗</span></Link>
  </main>;
}
