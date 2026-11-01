'use client';
export default function JobError({reset}:{reset:()=>void}){return <section className="jobs-page" role="alert"><h1>Saved work is unavailable</h1><p>We couldn’t load your execution checks. Please try again.</p><div className="jobs-actions"><button className="jobs-primary" onClick={reset}>Try again</button></div></section>;}
