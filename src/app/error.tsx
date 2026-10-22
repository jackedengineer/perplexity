"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="state-page"><p className="eyebrow">A brief pause</p>
    <h1>Something didn’t connect.</h1><p>Please try again in a moment.</p>
    <button className="button" onClick={reset}>Try again <span aria-hidden="true">↻</span></button>
    <Link className="back-link" href="/">Back to home</Link>
  </main>;
}
