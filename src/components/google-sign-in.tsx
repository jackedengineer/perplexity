"use client";
import { useState } from "react";

export function GoogleSignIn({ initialError = false, compact = false, label = "Continue with Google", destination = "/workspace" }: {destination?:"/workspace"|"/billing"; initialError?: boolean; compact?: boolean; label?: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(initialError);
  async function signIn() {
    setPending(true);
    setFailed(false);
    try {
      const {authClient}=await import('@/lib/auth-client');
      const result = await authClient.signIn.social({
        provider: "google", callbackURL: destination, errorCallbackURL: "/workspace?error=oauth",
      });
      if (result.error) throw new Error("Sign in failed");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return <div className={compact?"compact-sign-in":"sign-in-action"}>
    <button type="button" className={compact?"visitor-sign-in":"button google-button"} onClick={signIn} disabled={pending} aria-busy={pending}>
      {!compact&&<span aria-hidden="true" className={pending ? "spinner" : "google-mark"}>{pending ? "" : "G"}</span>}
      {pending ? "Connecting to Google…" : label}
      {!compact&&<span aria-hidden="true">↗</span>}
    </button>
    <div className="auth-feedback" aria-live="polite">
      {failed && <p role="alert">We couldn’t sign you in. Please try again.</p>}
    </div>
  </div>;
}
