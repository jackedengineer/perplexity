"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function GoogleSignIn({ initialError = false }: { initialError?: boolean }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(initialError);
  async function signIn() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signIn.social({
        provider: "google", callbackURL: "/workspace", errorCallbackURL: "/sign-in?error=oauth",
      });
      if (result.error) throw new Error("Sign in failed");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return <div className="sign-in-action">
    <button className="button google-button" onClick={signIn} disabled={pending} aria-busy={pending}>
      <span aria-hidden="true" className={pending ? "spinner" : "google-mark"}>{pending ? "" : "G"}</span>
      {pending ? "Connecting to Google…" : "Continue with Google"}
      <span aria-hidden="true">↗</span>
    </button>
    <div className="auth-feedback" aria-live="polite">
      {failed && <p role="alert">We couldn’t sign you in. Please try again.</p>}
    </div>
  </div>;
}
