"use client";
export default function ResearchError({ reset }: { reset: () => void }) {
  return <main id="main" className="research-state"><h1>Your workspace couldn’t load.</h1><p>Please try again in a moment.</p><button className="research-button" onClick={reset}>Try again</button></main>;
}
