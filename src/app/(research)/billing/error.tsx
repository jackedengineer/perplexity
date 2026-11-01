'use client';
export default function BillingError({reset}:{reset:()=>void}){return <section className="jobs-page" role="alert"><h1>Billing is unavailable</h1><p>We couldn’t load your subscription. Please retry before creating another checkout.</p><div className="jobs-actions"><button className="jobs-primary" onClick={reset}>Try again</button></div></section>;}
