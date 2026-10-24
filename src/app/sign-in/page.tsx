import {requiresGuestChallenge} from "@/server/auth/challenge";
import {GuestSignIn} from "@/components/guest-sign-in";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/current-session";
import { GoogleSignIn } from "@/components/google-sign-in";

export const metadata = { title: "Welcome back" };
export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const identity=await getCurrentSession();
  if (identity && !identity.user.isAnonymous) redirect("/workspace");
  const challengeRequired=requiresGuestChallenge(process.env.BETTER_AUTH_URL??"https://invalid");
  const guestEnabled=process.env.ENABLE_GUEST_TRIALS === "true"&&(!challengeRequired||Boolean(process.env.TURNSTILE_SITE_KEY&&process.env.TURNSTILE_SECRET_KEY));
  const { error } = await searchParams;
  return <main id="main" className="auth-layout">
    <section className="auth-story" aria-label="Welcome to Perplex">
      <Link href="/" className="wordmark">perplex<span aria-hidden="true">✳</span></Link>
      <div className="story-copy"><p className="eyebrow">A space for the curious</p>
        <h1>Every answer<br />starts with<br /><em>a little wonder.</em></h1>
        <p>Follow a thought. Find a new perspective.<br />Make the unfamiliar feel a little clearer.</p>
      </div>
      <p className="story-footer">Keep asking good questions.</p>
      <span className="orbit orbit-one" aria-hidden="true" /><span className="orbit orbit-two" aria-hidden="true" />
    </section>
    <section className="auth-panel">
      <Link className="back-link" href="/">← Back to home</Link>
      <div className="auth-card">
        <span className="welcome-symbol" aria-hidden="true">✳</span>
        <p className="eyebrow">Your next discovery awaits</p>
        <h2>A mind full<br />of possibilities.</h2>
        <p className="auth-description">Sign in to make yourself at home.</p>
        <GoogleSignIn initialError={Boolean(error)} />
        {!identity && guestEnabled && <GuestSignIn siteKey={process.env.TURNSTILE_SITE_KEY} />}
        <p className="privacy-note">We use your name and email to create your account.<br />Your Google password stays with Google.</p>
      </div>
      <p className="panel-footer">A quieter place to think a little bigger.</p>
    </section>
  </main>;
}
